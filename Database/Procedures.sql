
-------------------------------------------------------------------------------
---
--- Create an event (conference, usergroup meetup, etc) either from scratch
--- or by copying a template event. When using a template, the template's
--- questions and answer options are also copied.
---
--- @Userlist is a comma-delimited list of database users to be added to the
--- event.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Create_Event
    @Name                       nvarchar(200),
    @From_template_Event_ID     int=NULL,
    @From_template_name         nvarchar(200)=NULL,
    @Is_template                bit=0,
    @CSS                        nvarchar(max)=NULL,
    @Accepts_responses_from     datetime2(0)=NULL,
    @Accepts_responses_to       datetime2(0)=NULL,
    @Userlist                   nvarchar(max)=NULL,
    @Sessionize_API_key         varchar(50)=NULL
AS

SET NOCOUNT ON;

--- Event already exists - just updated it:
IF (EXISTS (SELECT NULL
            FROM Feedback.My_Events
            WHERE Sessionize_API_key=@Sessionize_API_key)) BEGIN;

    UPDATE Feedback.[Events]
    SET [Name]=@Name,
        CSS=@CSS,
        Is_template=@Is_template,
        Accepts_responses_from=@Accepts_responses_from,
        Accepts_responses_to=@Accepts_responses_to
    --- Return NULL as Event_secret to make sure a malicious actor cannot retrieve
    --- the secret by re-submitting the Sessionize token (which is publicly available).
    OUTPUT inserted.Event_ID, CAST(NULL AS uniqueidentifier) AS Event_secret
    WHERE Sessionize_API_key=@Sessionize_API_key;

    RETURN;
END;

DECLARE @Event_ID int;

--- Create new event:
DECLARE @event TABLE (
    Event_ID        int NOT NULL,
    Event_secret    uniqueidentifier NOT NULL
);

DECLARE @questions TABLE (
    Question_ID     int NOT NULL,
    New_Question_ID int NOT NULL
);

--- Look for an event template by name instead of ID?
IF (@From_template_name IS NOT NULL) BEGIN;
    SELECT TOP (1) @From_template_Event_ID=Event_ID
    FROM Feedback.[Events]
    WHERE Is_template=1
      AND [Name]=@From_template_name
    ORDER BY Event_ID;

    IF (@From_template_Event_ID IS NULL) BEGIN;
        THROW 50001, 'Could not find an event template by that name.', 1;
        RETURN;
    END;
END;       

--- Create a brand new event
IF (@From_template_Event_ID IS NULL)
    INSERT INTO Feedback.[Events] ([Name], CSS, Is_template, Accepts_responses_from, Accepts_responses_to)
    OUTPUT inserted.Event_ID, inserted.Event_secret INTO @event (Event_ID, Event_secret)
    VALUES (@Name, @CSS, @Is_template, @Accepts_responses_from, @Accepts_responses_to);

--- Copy a template event
IF (@From_template_Event_ID IS NOT NULL) BEGIN;
    --- Feedback.Events
    INSERT INTO Feedback.[Events] ([Name], CSS, Is_template, Accepts_responses_from, Accepts_responses_to, Sessionize_API_key)
    OUTPUT inserted.Event_ID, inserted.Event_secret INTO @event (Event_ID, Event_secret)
    SELECT ISNULL(@Name, [Name]),
           ISNULL(@CSS, CSS),
           @Is_template AS Is_template,
           @Accepts_responses_from,
           @Accepts_responses_to,
           @Sessionize_API_key
    FROM Feedback.Events
    WHERE Event_ID=@From_template_Event_ID;

    SELECT @Event_ID=Event_ID FROM @event;

    --- Feedback.Questions
    MERGE INTO Feedback.Questions AS new
    USING (SELECT * FROM Feedback.Questions WHERE Event_ID=@From_template_Event_ID) AS old ON
        new.Display_order=old.Display_order AND
        new.Event_ID=@Event_ID

    WHEN NOT MATCHED BY TARGET THEN
        INSERT (Event_ID, Display_order, Question, [Description], Optimal_percent, Is_required, [Type], Has_plaintext)
        VALUES (@Event_ID, Display_order, Question, [Description], Optimal_percent, Is_required, [Type], Has_plaintext)

    OUTPUT old.Question_ID, inserted.Question_ID
    INTO @questions (Question_ID, New_Question_ID);

    --- Feedback.Answers
    INSERT INTO Feedback.Answer_options (Question_ID, Answer_ordinal, Percent_value, If_selected_show_Question_ID, Annotation, CSS_classes)
    SELECT q.New_Question_ID AS Question_ID, a.Answer_ordinal, a.Percent_value, qx.New_Question_ID AS If_selected_show_Question_ID, a.Annotation, a.CSS_classes
    FROM Feedback.Answer_options AS a
    INNER JOIN @questions AS q ON a.Question_ID=q.Question_ID
    LEFT JOIN @questions AS qx ON a.If_selected_show_Question_ID=qx.Question_ID;
END;

INSERT INTO Feedback.Event_users (Event_ID, [User])
SELECT DISTINCT e.Event_ID, u.[name]
FROM @event AS e
CROSS JOIN STRING_SPLIT(ISNULL(@Userlist+',', '')+SUSER_SNAME(), ',') AS list
INNER JOIN sys.database_principals AS u ON
    list.[value] COLLATE database_default=u.[name] OR
    list.[value] COLLATE database_default=SUBSTRING(u.[name], CHARINDEX(N'\', u.[name]+'\')+1, LEN(u.[name]));

--- Output the new Event_ID
SELECT Event_ID, Event_secret
FROM @event;

GO

-------------------------------------------------------------------------------
---
--- Delete an event.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Delete_Event
    @Event_ID                   int
AS

SET NOCOUNT ON;

IF (NOT EXISTS (SELECT NULL FROM Feedback.My_Events WHERE Event_ID=@Event_ID))
    THROW 50001, 'Event not found or you do not have access to it.', 1;

BEGIN TRANSACTION;

    --- Event -> Event users
    DELETE FROM Feedback.Event_users
    WHERE Event_ID=@Event_ID;

    --- Event -> Sessions -> Responses -> Response plaintext
    DELETE FROM Feedback.Response_Plaintext
    WHERE Response_ID IN (SELECT Response_ID FROM Feedback.Responses WHERE Session_ID IN (SELECT Session_ID FROM Feedback.[Sessions] WHERE Event_ID=@Event_ID));

    --- Event -> Sessions -> Responses -> Response answers
    DELETE FROM Feedback.Response_Answers
    WHERE Response_ID IN (SELECT Response_ID FROM Feedback.Responses WHERE Session_ID IN (SELECT Session_ID FROM Feedback.[Sessions] WHERE Event_ID=@Event_ID));

    --- Event -> Sessions -> Responses
    DELETE FROM Feedback.Responses
    WHERE Session_ID IN (SELECT Session_ID FROM Feedback.[Sessions] WHERE Event_ID=@Event_ID);

    --- Event -> Questions -> Answer options
    DELETE FROM Feedback.Answer_options
    WHERE Question_ID IN (SELECT Question_ID FROM Feedback.Questions WHERE Event_ID=@Event_ID);

    --- Event -> Questions
    DELETE FROM Feedback.Questions
    WHERE Event_ID=@Event_ID;

    --- Event -> Sessions -> Session presenters
    DELETE FROM Feedback.Session_presenters
    WHERE Session_ID IN (SELECT Session_ID FROM Feedback.[Sessions] WHERE Event_ID=@Event_ID);

    --- Presenters that do not feature in any session anymore
    DELETE FROM Feedback.Presenters
    WHERE Presenter_ID NOT IN (SELECT Presented_by_ID FROM Feedback.Session_presenters);

    --- Event -> Sessions
    DELETE FROM Feedback.[Sessions]
    WHERE Event_ID=@Event_ID;

    --- Event
    DELETE FROM Feedback.[Events]
    WHERE Event_ID=@Event_ID;

COMMIT TRANSACTION;

GO

-------------------------------------------------------------------------------
---
--- Create a presenter.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Create_Presenter
    @Name                       nvarchar(200),
    @Email                      varchar(300)=NULL,
    @Identifier                 varchar(50)=NULL
AS

SET NOCOUNT ON;

MERGE INTO Feedback.Presenters AS p
USING (
        VALUES (@Name, @Email, @Identifier)
    ) AS x([Name], Email, Identifier)
    ON p.Email=x.Email OR p.Identifier=x.Identifier

WHEN NOT MATCHED BY TARGET THEN
    INSERT ([Name], Email, Identifier)
    VALUES (x.[Name], x.Email, x.Identifier)

WHEN MATCHED THEN
    UPDATE SET p.[Name]=x.[Name],
               p.Identifier=ISNULL(x.Identifier, p.Identifier),
               p.Email=ISNULL(x.Email, p.Email)

OUTPUT inserted.Presenter_ID;

GO

-------------------------------------------------------------------------------
---
--- Create a session.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Create_Session
    @Event_ID               int,
    @Title                  nvarchar(200),
    @Sessionize_id          int=NULL
AS

SET NOCOUNT ON;

IF (NOT EXISTS (SELECT NULL FROM Feedback.My_Events WHERE Event_ID=@Event_ID))
    THROW 50001, 'Event not found or you do not have access to it.', 1;

--- Create a new session:
IF (@Sessionize_id IS NULL)
    INSERT INTO Feedback.[Sessions] (Event_ID, Title)
    OUTPUT inserted.Session_ID
    VALUES (@Event_ID, @Title);

--- If it's a Sessionize session, we can upsert it using the Sessionize ID:
IF (@Sessionize_id IS NOT NULL) BEGIN;

    --- But to make everything work, we need to delete all the presenters
    --- for the session. Don't worry, though. We'll add them back in a moment.
    DELETE sp
    FROM Feedback.Session_Presenters AS sp
    INNER JOIN Feedback.[Sessions] AS s ON sp.Session_ID=s.Session_ID
    WHERE s.Sessionize_id=@Sessionize_id
      AND s.Event_ID=@Event_ID;

    MERGE INTO Feedback.[Sessions] AS s
    USING (SELECT NULL AS n) AS x ON s.Sessionize_id=@Sessionize_id AND s.Event_ID=@Event_ID

    WHEN MATCHED THEN
        UPDATE SET s.Title=@Title

    WHEN NOT MATCHED BY TARGET THEN
        INSERT (Event_ID, Title, Sessionize_id)
        VALUES (@Event_ID, @Title, @Sessionize_id)
        
    OUTPUT inserted.Session_ID;

END;

GO

-------------------------------------------------------------------------------
---
--- Connect a presenter to a session.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Create_Session_Presenter
    @Session_ID             bigint,
    @Presenter_ID           int,
    @Is_session_owner       bit=0
AS

SET NOCOUNT ON;

IF (NOT EXISTS (SELECT NULL FROM Feedback.My_Sessions WHERE Session_ID=@Session_ID))
    THROW 50001, 'Session not found or you do not have access to the event.', 1;

BEGIN TRANSACTION;

    IF (@Is_session_owner=1)
        UPDATE Feedback.Session_Presenters
        SET Is_session_owner=0
        WHERE Session_ID=@Session_ID
          AND Presented_by_ID!=@Presenter_ID
          AND Is_session_owner=1;

    MERGE INTO Feedback.Session_Presenters AS sp
    USING (VALUES (@Session_ID, @Presenter_ID)) AS x(Session_ID, Presenter_ID)
        ON sp.Session_ID=x.Session_ID AND sp.Presented_by_ID=x.Presenter_ID

    WHEN MATCHED AND sp.Is_session_owner!=@Is_session_owner THEN
        UPDATE SET sp.Is_session_owner=@Is_session_owner

    WHEN NOT MATCHED BY TARGET THEN
        INSERT (Session_ID, Presented_by_ID, Is_session_owner)
        VALUES (@Session_ID, @Presenter_ID, @Is_session_owner);

COMMIT TRANSACTION;

GO

-------------------------------------------------------------------------------
---
--- Create a question.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Create_Question
    @Event_ID        int,
    @Display_order   tinyint=NULL,
    @Question        nvarchar(200),
    @Description     nvarchar(max)=NULL,
    @Optimal_percent smallint=NULL,
    @Is_required     bit=0,
    @Type            varchar(20)='radio',
    @Has_plaintext   bit=0
AS

SET NOCOUNT ON;

IF (NOT EXISTS (SELECT NULL FROM Feedback.My_Events WHERE Event_ID=@Event_ID))
    THROW 50001, 'Event not found or you do not have access to it.', 1;

--- If we didn't specify a display order, add the question last.
IF (@Display_order IS NULL)
    SELECT @Display_order=ISNULL(MAX(Display_order), 0)+1
    FROM Feedback.Questions
    WHERE Event_ID=@Event_ID;

BEGIN TRANSACTION;

    --- If the Display_order already exists for this Event_ID, shift
    --- all of the following questions to make room for this one.
    IF (EXISTS (SELECT NULL FROM Feedback.Questions
                WHERE Event_ID=@Event_ID AND Display_order=@Display_order))
        UPDATE Feedback.Questions
        SET Display_order=Display_order+1
        WHERE Event_ID=@Event_ID
          AND Display_order>=@Display_order;

    --- Add the question
    INSERT INTO Feedback.Questions (Event_ID, Display_order, Question, [Description], Optimal_percent, Is_required, [Type], Has_plaintext)
    OUTPUT inserted.Question_ID
    VALUES (@Event_ID, @Display_order, @Question, @Description, @Optimal_percent, @Is_required, @Type, @Has_plaintext);

    --- Pack the Display_order in case we've created gaps
    UPDATE q
    SET q.Display_order=q._new
    FROM (
        SELECT Display_order, ROW_NUMBER() OVER (ORDER BY Display_order) AS _new
        FROM Feedback.Questions
        WHERE Event_ID=@Event_ID
        ) AS q
    WHERE q.Display_order!=q._new;

COMMIT TRANSACTION;

GO

-------------------------------------------------------------------------------
---
--- Update a question.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Update_Question
    @Question_ID     int,
    @Display_order   tinyint=NULL,
    @Question        nvarchar(200)=NULL,
    @Description     nvarchar(max)=NULL,
    @Optimal_percent smallint=NULL,
    @Is_required     bit=NULL,
    @Type            varchar(20)=NULL,
    @Has_plaintext   bit=NULL
AS

SET NOCOUNT ON;

DECLARE @Event_ID int=(SELECT Event_ID FROM Feedback.My_Questions WHERE Question_ID=@Question_ID);

IF (@Event_ID IS NULL)
    THROW 50001, 'Question not found or you do not have access to it.', 1;

BEGIN TRANSACTION;

    --- If another question occupies this Display_order, shift
    --- all of the following questions to make room for this one.
    IF (EXISTS (SELECT NULL FROM Feedback.Questions
                WHERE Event_ID=@Event_ID
                  AND Display_order=@Display_order
                  AND Question_ID!=@Question_ID))
        UPDATE Feedback.Questions
        SET Display_order=Display_order+1
        WHERE Event_ID=@Event_ID
          AND Display_order>=@Display_order;

    --- Update the question
    UPDATE Feedback.Questions
    SET Display_order=ISNULL(@Display_order, Display_order),
        Question=ISNULL(@Question, Question),
        [Description]=ISNULL(@Description, [Description]),
        Optimal_percent=ISNULL(@Optimal_percent, Optimal_percent),
        Is_required=ISNULL(@Is_required, Is_required),
        [Type]=ISNULL(@Type, [Type]),
        Has_plaintext=ISNULL(@Has_plaintext, Has_plaintext)
    WHERE Question_ID=@Question_ID;

    --- Pack the Display_order in case we've created gaps
    UPDATE q
    SET q.Display_order=q._new
    FROM (
        SELECT Display_order, ROW_NUMBER() OVER (ORDER BY Display_order) AS _new
        FROM Feedback.Questions
        WHERE Event_ID=@Event_ID
        ) AS q
    WHERE q.Display_order!=q._new;

COMMIT TRANSACTION;

GO

-------------------------------------------------------------------------------
---
--- Delete a question.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Delete_Question
    @Question_ID     int
AS

SET NOCOUNT ON;

DECLARE @Event_ID int=(SELECT Event_ID FROM Feedback.My_Questions WHERE Question_ID=@Question_ID);

IF (@Event_ID IS NULL)
    THROW 50001, 'Question not found or you do not have access to it.', 1;

BEGIN TRANSACTION;

    DELETE FROM Feedback.Response_Answers WHERE Question_ID=@Question_ID;
    DELETE FROM Feedback.Answer_options WHERE Question_ID=@Question_ID;
    DELETE FROM Feedback.Questions WHERE Question_ID=@Question_ID;

    --- Pack the Display_order in case we've created a gap
    UPDATE q
    SET q.Display_order=q._new
    FROM (
        SELECT Display_order, ROW_NUMBER() OVER (ORDER BY Display_order) AS _new
        FROM Feedback.Questions
        WHERE Event_ID=@Event_ID
        ) AS q
    WHERE q.Display_order!=q._new;

COMMIT TRANSACTION;

GO

-------------------------------------------------------------------------------
---
--- Create an answer option.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Create_Answer_option
    @Question_ID                int,
    @Answer_ordinal             smallint=NULL,
    @Percent_value              smallint=NULL,
    @If_selected_show_Question_ID int=NULL,
    @Annotation                 nvarchar(200)=NULL,
    @CSS_classes                nvarchar(200)=NULL
AS

SET NOCOUNT ON;

IF (NOT EXISTS (SELECT NULL FROM Feedback.My_Questions WHERE Question_ID=@Question_ID))
    THROW 50001, 'Question not found or you do not have access to it.', 1;

--- If we didn't specify a display order, add the question last.
IF (@Answer_ordinal IS NULL)
    SELECT @Answer_ordinal=ISNULL(MAX(Answer_ordinal), 0)+1
    FROM Feedback.Answer_options
    WHERE Question_ID=@Question_ID;

BEGIN TRANSACTION;

    --- If the Display_order already exists for this Event_ID, shift
    --- all of the following questions to make room for this one.
    IF (EXISTS (SELECT NULL FROM Feedback.Answer_options
                WHERE Question_ID=@Question_ID AND Answer_ordinal=@Answer_ordinal))
        UPDATE Feedback.Answer_options
        SET Answer_ordinal=Answer_ordinal+1
        WHERE Question_ID=@Question_ID
          AND Answer_ordinal>=@Answer_ordinal;

    --- Add the question
    INSERT INTO Feedback.Answer_options (Question_ID, Answer_ordinal, Percent_value, If_selected_show_Question_ID, Annotation, CSS_classes)
    OUTPUT inserted.Answer_option_ID
    VALUES (@Question_ID, @Answer_ordinal, @Percent_value, @If_selected_show_Question_ID, @Annotation, @CSS_classes);

    --- Pack the Answer_ordinal in case we've created a gap
    UPDATE q
    SET q.Answer_ordinal=q._new
    FROM (
        SELECT Answer_ordinal, ROW_NUMBER() OVER (ORDER BY Answer_ordinal) AS _new
        FROM Feedback.Answer_options
        WHERE Question_ID=@Question_ID
        ) AS q
    WHERE q.Answer_ordinal!=q._new;

COMMIT TRANSACTION;

GO

-------------------------------------------------------------------------------
---
--- Create a new blank response and retrieve all the questions for a session
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Init_Response
    @Session_ID         bigint
AS

DECLARE @id TABLE (
    Client_key      uniqueidentifier NOT NULL,
    Response_ID     int NOT NULL
);

INSERT INTO Feedback.Responses (Session_ID, Created, Updated)
OUTPUT inserted.Client_key, inserted.Response_ID INTO @id (Client_key, Response_ID)
SELECT s.Session_ID, SYSUTCDATETIME() AS Created, SYSUTCDATETIME() AS Created
FROM Feedback.[Sessions] AS s
INNER JOIN Feedback.Events AS e ON s.Event_ID=e.Event_ID
WHERE s.Session_ID=@Session_ID
  AND ISNULL(e.Accepts_responses_from, {d '2000-01-01'})<SYSDATETIME()
  AND ISNULL(e.Accepts_responses_to, {d '2099-12-31'})>SYSDATETIME();

IF (@@ROWCOUNT=0) BEGIN;
    THROW 50001, 'Invalid session_id or this session is no longer accepting responses.', 1;
    RETURN;
END;

SELECT (SELECT id.Client_key AS clientKey,
               id.Response_ID AS responseId,
               e.CSS AS css,
               s.Title AS title,

               --- Presenters:
               (SELECT p.Name AS [name]
                FROM Feedback.Session_Presenters AS sp
                INNER JOIN Feedback.Presenters AS p ON sp.Presented_by_ID=p.Presenter_ID
                WHERE sp.Session_ID=@Session_ID
                ORDER BY sp.Is_session_owner DESC, p.Name
                FOR JSON PATH) AS speakers,

               --- Questions:
               (SELECT q.Question AS question,
                       q.[Description] AS [description],
                       q.Question_ID AS questionId,
                       q.Is_required AS isRequired,
                       ISNULL(i.Indent, 0) AS indent,
                       CAST((CASE WHEN linked.Question_ID IS NULL THEN 1 ELSE 0 END) AS bit) AS display,
                       q.[Type] AS [type],
                       CAST((CASE WHEN q.Has_plaintext=1 OR q.[Type]='text' THEN 1 ELSE 0 END) AS bit) AS allowPlaintext,
                       CAST((CASE WHEN opts.Percentage_count>0 THEN 1 ELSE 0 END) AS bit) AS hasPercentages,

                       --- Answer options to the question:
                       (SELECT ao.Answer_ordinal AS answer_ordinal,
                               ao.Annotation AS annotation,
                               ao.If_selected_show_Question_ID AS followUpQuestionId,
                               ao.CSS_classes AS classList
                        FROM Feedback.Answer_options AS ao
                        WHERE ao.Question_ID=q.Question_ID
                        ORDER BY ao.Answer_ordinal
                        FOR JSON PATH) AS options
                FROM Feedback.Questions AS q
                LEFT JOIN Feedback.Question_Indent AS i ON q.Question_ID=i.Question_ID
                LEFT JOIN (
                    SELECT DISTINCT If_selected_show_Question_ID AS Question_ID
                    FROM Feedback.Answer_options
                    ) AS linked ON linked.Question_ID=q.Question_ID
                LEFT JOIN (
                    SELECT Question_ID, COUNT(Percent_value) AS Percentage_count
                    FROM Feedback.Answer_options
                    GROUP BY Question_ID
                    ) AS opts ON opts.Question_ID=q.Question_ID
                WHERE q.Event_ID=e.Event_ID
                ORDER BY q.Display_order
                FOR JSON PATH) AS questions

        FROM Feedback.[Sessions] AS s
        INNER JOIN Feedback.[Events] AS e ON s.Event_ID=e.Event_ID
        CROSS JOIN @id AS id
        WHERE s.Session_ID=@Session_ID
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ) AS Question_blob;

GO

-------------------------------------------------------------------------------
---
--- Save a response to a question
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Save_Response_Answer
    @Response_ID            int,
    @Client_key             uniqueidentifier,
    @Question_ID            int,
    @Answer_ordinal         smallint=NULL,
    @Plaintext              nvarchar(max)=NULL
AS

SET NOCOUNT ON;

BEGIN TRANSACTION;

    --- Uncheck a checkbox
    IF (@Answer_ordinal<0) BEGIN;
        DELETE ra
        FROM Feedback.Response_Answers AS ra
        INNER JOIN Feedback.Responses AS r ON ra.Response_ID=r.Response_ID
        INNER JOIN Feedback.Questions AS q ON ra.Question_ID=q.Question_ID
        INNER JOIN Feedback.Answer_options AS ao ON q.Question_ID=ao.Question_ID AND ra.Answer_option_ID=ao.Answer_Option_ID
        WHERE r.Response_ID=@Response_ID
          AND r.Client_key=@Client_key
          AND q.[Type]='checkbox'
          AND ao.Answer_ordinal=-@Answer_ordinal;
    END;

    --- Update radio button or check checkbox
    IF (@Answer_ordinal>0) BEGIN;
        WITH x AS (
            SELECT q.[Type], ao.Answer_option_ID
            FROM Feedback.Responses AS r
            INNER JOIN Feedback.[Sessions] AS s ON r.Session_ID=s.Session_ID
            INNER JOIN Feedback.Questions AS q ON s.Event_ID=q.Event_ID
            INNER JOIN Feedback.Answer_options AS ao ON q.Question_ID=ao.Question_ID
            WHERE r.Response_ID=@Response_ID
              AND r.Client_key=@Client_key
              AND q.Question_ID=@Question_ID
              AND ao.Answer_ordinal=@Answer_ordinal)

        MERGE INTO Feedback.Response_Answers AS ra
        USING x ON ra.Response_ID=@Response_ID AND ra.Question_ID=@Question_ID
          AND (x.[Type]='checkbox' AND ra.Answer_option_ID=x.Answer_option_ID OR x.[Type]='radio')

        --- Set checkbox or radio button
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (Response_ID, Question_ID, Answer_option_ID, Created, Revision, Updated)
            VALUES (@Response_ID, @Question_ID, x.Answer_option_ID, SYSUTCDATETIME(), 0, SYSUTCDATETIME())

        --- Update radio button
        WHEN MATCHED AND x.[Type]='radio' THEN
            UPDATE SET ra.Answer_option_ID=x.Answer_option_ID,
                       ra.Revision=ra.Revision+1,
                       ra.Updated=SYSUTCDATETIME();
    END;

    --- Plaintext response
    IF (@Answer_ordinal IS NULL) BEGIN;
        SET @Plaintext=NULLIF(@Plaintext, N'');

        WITH x AS (
            SELECT NULL AS n --r.Response_ID, q.Question_ID, @Plaintext AS Plaintext
            FROM Feedback.Responses AS r
            INNER JOIN Feedback.[Sessions] AS s ON r.Session_ID=s.Session_ID
            INNER JOIN Feedback.Questions AS q ON s.Event_ID=q.Event_ID
            WHERE r.Response_ID=@Response_ID
              AND r.Client_key=@Client_key
              AND q.Question_ID=@Question_ID)

        MERGE INTO Feedback.Response_Plaintext AS rp
        USING x ON rp.Response_ID=@Response_ID AND rp.Question_ID=@Question_ID

        WHEN NOT MATCHED BY TARGET THEN
            INSERT (Response_ID, Question_ID, Plaintext, Created, Revision, Updated)
            VALUES (@Response_ID, @Question_ID, @Plaintext, SYSUTCDATETIME(), 0, SYSUTCDATETIME())

        WHEN MATCHED AND @Plaintext IS NULL THEN
            DELETE

        WHEN MATCHED THEN
            UPDATE SET rp.Plaintext=@Plaintext,
                       rp.Revision=rp.Revision+1,
                       rp.Updated=SYSUTCDATETIME();
    END;

    UPDATE Feedback.Responses
    SET Updated=SYSUTCDATETIME()
    WHERE Response_ID=@Response_ID;

COMMIT TRANSACTION;

GO

-------------------------------------------------------------------------------
---
--- List other sessions,
--- 1. for this event (when we've already reviewed a session), or
--- 2. for a combination of event and presenter
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Get_Sessions
    @Response_ID            int=NULL,
    @Client_key             uniqueidentifier=NULL,
    @Presenter_ID           int=NULL,
    @Event_ID               int=NULL
AS

SET NOCOUNT ON;

IF (NOT (@Response_ID IS NOT NULL AND @Client_key IS NOT NULL AND @Presenter_ID IS NULL AND @Event_ID IS NULL
         OR
         @Response_ID IS NULL AND @Client_key IS NULL AND @Presenter_ID IS NOT NULL AND @Event_ID IS NOT NULL)) BEGIN;
    THROW 50001, 'This proc requires (@Response_ID, @Client_key) or (@Presenter_ID, @Event_ID).', 1;
    RETURN;
END;

SELECT (SELECT s.Session_ID AS sessionId,
               s.Title AS title,
               e.CSS AS css,

               --- Presenters:
               (SELECT p.[Name] AS [name]
                FROM Feedback.Session_Presenters AS sp
                INNER JOIN Feedback.Presenters AS p ON sp.Presented_by_ID=p.Presenter_ID
                WHERE sp.Session_ID=s.Session_ID
                ORDER BY p.[Name]
                FOR JSON PATH) AS presenters
        FROM Feedback.[Sessions] AS s
        INNER JOIN Feedback.Events AS e ON s.Event_ID=e.Event_ID

        WHERE --- Option 1: Filtering on (@Response_ID, @Client_key)
              s.Event_ID IN (SELECT s.Event_ID
                             FROM Feedback.Responses AS r
                             INNER JOIN Feedback.[Sessions] AS s ON r.Session_ID=s.Session_ID
                             WHERE r.Response_ID=@Response_ID
                               AND r.Client_key=@Client_key)

              --- Option 2: Filtering on (@Presenter_ID, @Event_ID)
           OR s.Session_ID IN (SELECT s.Session_ID
                               FROM Feedback.Session_Presenters AS sp
                               INNER JOIN Feedback.[Sessions] AS s ON sp.Session_ID=s.Session_ID
                               WHERE sp.Presented_by_ID=@Presenter_ID
                                 AND s.Event_ID=@Event_ID)

        ORDER BY s.Title
        FOR JSON PATH
        ) AS Sessions_blob;

GO

-------------------------------------------------------------------------------
---
--- List all the templates available to create events from
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Get_Templates
AS

SET NOCOUNT ON;

SELECT (
        SELECT /*Event_ID AS eventId,*/ [Name] AS [name], CSS AS css
        FROM Feedback.[Events]
        WHERE Is_template=1
        ORDER BY [Name]
        FOR JSON PATH
        ) AS Template_blob;

GO

-------------------------------------------------------------------------------
---
--- Retrieve admin information for av event
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Admin_Event_Info
    @Event_secret       uniqueidentifier
AS

SET NOCOUNT ON;

SELECT (
        SELECT e.Event_ID AS eventId,
            e.[Name] AS [name],
            e.CSS AS css,
            (SELECT s.Session_ID AS sessionId,
                    s.Title AS title,
                    e.CSS AS css,

                    --- Presenters:
                    (SELECT p.[Name] AS [name]
                     FROM Feedback.Session_Presenters AS sp
                     INNER JOIN Feedback.Presenters AS p ON sp.Presented_by_ID=p.Presenter_ID
                     WHERE sp.Session_ID=s.Session_ID
                     ORDER BY p.[Name]
                     FOR JSON PATH) AS presenters

                FROM Feedback.[Sessions] AS s
                INNER JOIN Feedback.Events AS e ON s.Event_ID=e.Event_ID
                WHERE s.Event_ID=e.Event_ID
                ORDER BY s.Title
                FOR JSON PATH
                ) AS [sessions]
        FROM Feedback.[Events] AS e
        WHERE e.Event_secret=@Event_secret
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ) AS Event_blob;

GO

-------------------------------------------------------------------------------
---
--- Extract a report on the event, containing details on sessions, presenters,
--- questions, answer options, as well as all the responses.
---
-------------------------------------------------------------------------------

CREATE OR ALTER PROCEDURE Feedback.Get_Event_Report
    @Event_secret       uniqueidentifier
AS

SET NOCOUNT ON;

DECLARE @Event_ID int;

SELECT TOP (1) @Event_ID=Event_ID
FROM Feedback.[Events] AS e
WHERE e.Event_secret=@Event_secret;

SELECT (
        SELECT e.[Name] AS [name],

            (SELECT p.Presenter_ID AS presenterId,
                    p.[Name] AS [name],
                    p.Email AS email
                FROM Feedback.Session_presenters AS sp
                INNER JOIN Feedback.Presenters AS p ON sp.Presented_by_ID=p.Presenter_ID
                WHERE sp.Session_ID IN (
                    SELECT Session_ID
                    FROM Feedback.[Sessions]
                    WHERE Event_ID=@Event_ID)
                FOR JSON PATH) AS presenters,

            (SELECT q.Question_ID AS questionId,
                    q.Display_order AS displayOrder,
                    q.Question AS [text],
                    q.[Type] AS [type],
                    q.Optimal_percent AS optimalValue,

                    (SELECT ao.Answer_option_ID AS optionId,
                            ao.Answer_ordinal AS ordinal,
                            ao.Percent_value AS [percent],
                            ao.Annotation AS annotation
                        FROM Feedback.Answer_options AS ao
                        WHERE ao.Question_ID=q.Question_ID
                        ORDER BY ao.Answer_ordinal
                        FOR JSON PATH) AS options

                FROM Feedback.Questions AS q
                WHERE q.Event_ID=@Event_ID
                FOR JSON PATH) AS questions,

            (SELECT s.Session_ID AS sessionId,
                    s.Sessionize_id AS sessionizeId,
                    s.Title AS title,

                    (SELECT sp.Presented_by_ID AS presenterId,
                            sp.Is_session_owner AS isOwner
                        FROM Feedback.Session_Presenters AS sp
                        WHERE sp.Session_ID=s.Session_ID
                        FOR JSON PATH) AS presenters,

                    (SELECT r.Created AS created,
                            r.Updated AS updated,

                            (SELECT ra.Answer_option_ID AS optionId
                                FROM Feedback.Response_Answers AS ra
                                WHERE ra.Response_ID=r.Response_ID
                                FOR JSON PATH) AS answers,

                            (SELECT rp.Plaintext AS [text]
                                FROM Feedback.Response_Plaintext AS rp
                                WHERE rp.Response_ID=r.Response_ID
                                FOR JSON PATH) AS textAnswers

                        FROM Feedback.Responses AS r
                        WHERE r.Session_ID=s.Session_ID
                        FOR JSON PATH) AS responses

                FROM Feedback.[Sessions] AS s
                WHERE s.Event_ID=@Event_ID
                FOR JSON PATH) AS [sessions]

        FROM Feedback.[Events] AS e
        WHERE e.Event_ID=@Event_ID
          AND e.Event_secret=@Event_secret
        FOR JSON AUTO, WITHOUT_ARRAY_WRAPPER) AS Report_blob;

GO
