IF (SCHEMA_ID('Feedback') IS NULL)
    EXEC('CREATE SCHEMA Feedback;');
GO
DROP VIEW IF EXISTS Feedback.Question_Indent;
DROP VIEW IF EXISTS Feedback.My_Answer_Options;
DROP VIEW IF EXISTS Feedback.My_Questions;
DROP VIEW IF EXISTS Feedback.My_Sessions;
DROP VIEW IF EXISTS Feedback.My_Events;

DROP TABLE IF EXISTS Feedback.Response_Plaintext;
DROP TABLE IF EXISTS Feedback.Response_Answers;
DROP TABLE IF EXISTS Feedback.Responses;
DROP TABLE IF EXISTS Feedback.Answer_options;
DROP TABLE IF EXISTS Feedback.Questions;
DROP TABLE IF EXISTS Feedback.Session_presenters;
DROP TABLE IF EXISTS Feedback.[Sessions];
DROP TABLE IF EXISTS Feedback.Presenters;
DROP TABLE IF EXISTS Feedback.Event_users;
DROP TABLE IF EXISTS Feedback.[Events];

DROP SEQUENCE IF EXISTS Feedback.ID;
GO

CREATE SEQUENCE Feedback.ID AS int START WITH 10000 INCREMENT BY 1;

--- Events
-------------------------------------------------

CREATE TABLE Feedback.[Events] (
    Event_ID                    int CONSTRAINT DF_Events_ID DEFAULT (NEXT VALUE FOR Feedback.ID) NOT NULL,
    [Name]                      nvarchar(200) NOT NULL,
    CSS                         nvarchar(max) NULL,
    Is_template                 bit NOT NULL,
    Accepts_responses_from      datetime2(0) NULL,
    Accepts_responses_to        datetime2(0) NULL,
    Sessionize_API_key          varchar(50) NULL,
    Event_secret                uniqueidentifier DEFAULT (NEWID()) NOT NULL
    CONSTRAINT PK_Events PRIMARY KEY CLUSTERED (Event_ID)
);

CREATE UNIQUE INDEX IX_Events_Sessionize_key ON Feedback.[Events] (Sessionize_API_key) WHERE (Sessionize_API_key IS NOT NULL);
CREATE UNIQUE INDEX IX_Events_Template_name ON Feedback.[Events] ([Name]) WHERE (Is_template=1);

--- Row-based access rules for events
-------------------------------------------------

CREATE TABLE Feedback.Event_users (
    Event_ID                    int NOT NULL,
    [User]                      sysname NOT NULL,
    CONSTRAINT PK_Event_users PRIMARY KEY CLUSTERED (Event_ID, [User]),
    CONSTRAINT FK_Event_users_Event FOREIGN KEY (Event_ID) REFERENCES Feedback.[Events] (Event_ID) ON DELETE CASCADE
);

--- Presenters
-------------------------------------------------

CREATE TABLE Feedback.Presenters (
    Presenter_ID    int CONSTRAINT DF_Presenters_ID DEFAULT (NEXT VALUE FOR Feedback.ID) NOT NULL,
    [Name]          nvarchar(200) NOT NULL,
    Email           varchar(300) NULL,
    Identifier      varchar(50) NULL,
    CONSTRAINT PK_Presenters PRIMARY KEY CLUSTERED (Presenter_ID)
);

CREATE UNIQUE INDEX IX_Presenters_Identifier ON Feedback.Presenters (Identifier) WHERE (Identifier IS NOT NULL);

--- Sessions
-------------------------------------------------

CREATE TABLE Feedback.[Sessions] (
    Session_ID      bigint CONSTRAINT DF_Sessions_ID DEFAULT (ABS(CAST(CONVERT(varbinary(6), NEWID()) AS bigint))) NOT NULL,
    Event_ID        int NOT NULL,
    Sessionize_id   int NULL,
    Title           nvarchar(200) NOT NULL,
    CONSTRAINT PK_Sessions PRIMARY KEY CLUSTERED (Session_ID),
    CONSTRAINT FK_Sessions_Event FOREIGN KEY (Event_ID) REFERENCES Feedback.[Events] (Event_ID)
);

CREATE UNIQUE INDEX IX_Sessions_Sessionize_id
    ON Feedback.[Sessions] (Event_ID, Sessionize_id) WHERE (Sessionize_id IS NOT NULL);

--- Session presenters:
-------------------------------------------------

CREATE TABLE Feedback.Session_presenters (
    Session_ID          bigint NOT NULL,
    Presented_by_ID     int NOT NULL,
    Is_session_owner    bit NOT NULL,
    CONSTRAINT PK_Session_presenters PRIMARY KEY CLUSTERED (Session_ID, Presented_by_ID),
    CONSTRAINT FK_Session_presenters_Session FOREIGN KEY (Session_ID) REFERENCES Feedback.[Sessions] (Session_ID),
    CONSTRAINT FK_Session_presenters_Presented_by FOREIGN KEY (Presented_by_ID) REFERENCES Feedback.Presenters (Presenter_ID)
);

--- Make sure each session can only have a single owner.
CREATE UNIQUE INDEX IX_Session_owner
    ON Feedback.Session_presenters
        (Session_ID) INCLUDE (Presented_by_ID)
    WHERE (Is_session_owner=1);

--- Questions
-------------------------------------------------

CREATE TABLE Feedback.Questions (
    Question_ID         int CONSTRAINT DF_Questions_ID DEFAULT (NEXT VALUE FOR Feedback.ID) NOT NULL,
    Event_ID            int NOT NULL,
    Display_order       tinyint NOT NULL,
    Question            nvarchar(200) NOT NULL,
    [Description]       nvarchar(max) NULL,
    Optimal_percent     smallint NULL,
    Is_required         bit NOT NULL,
    [Type]              varchar(20) NOT NULL,
    Has_plaintext       bit NOT NULL,
    CONSTRAINT PK_Questions PRIMARY KEY CLUSTERED (Question_ID),
    CONSTRAINT UQ_Questions UNIQUE (Event_ID, Display_order),
    CONSTRAINT CK_Questions_Type CHECK ([Type] IN ('checkbox', 'radio', 'text')),
    CONSTRAINT FK_Questions_Event FOREIGN KEY (Event_ID) REFERENCES Feedback.[Events] (Event_ID)
);

--- Answer options to the questions:
-------------------------------------------------

CREATE TABLE Feedback.Answer_options (
    Question_ID         int NOT NULL,
    Answer_option_ID    int CONSTRAINT DF_Answer_option_ID DEFAULT (NEXT VALUE FOR Feedback.ID) NOT NULL,
    Answer_ordinal      smallint NOT NULL,
    Percent_value       smallint NULL,
    If_selected_show_Question_ID int NULL,
    Annotation          nvarchar(200) NULL,
    CSS_classes         nvarchar(200) NULL,
    CONSTRAINT PK_Answer_options PRIMARY KEY CLUSTERED (Answer_option_ID),
    CONSTRAINT UQ_Answer_options UNIQUE (Question_ID, Answer_ordinal),
    CONSTRAINT CK_Answer_options_Percent_value CHECK (ISNULL(Percent_value, 0) BETWEEN -100 AND 100),
    CONSTRAINT FK_Answer_options_Question FOREIGN KEY (Question_ID) REFERENCES Feedback.Questions (Question_ID),
    CONSTRAINT FK_Answer_options_If_selected_Question FOREIGN KEY (If_selected_show_Question_ID) REFERENCES Feedback.Questions (Question_ID)
);

--- Feedback responses:
-------------------------------------------------

CREATE TABLE Feedback.Responses (
    Response_ID     bigint CONSTRAINT DF_Responses_ID DEFAULT (NEXT VALUE FOR Feedback.ID) NOT NULL,
    Session_ID      bigint NOT NULL,
    Client_key      uniqueidentifier CONSTRAINT DF_Response_key DEFAULT (NEWID()) NOT NULL,
    Created         datetime2(3) NOT NULL,
    Updated         datetime2(3) NOT NULL,
    CONSTRAINT PK_Response PRIMARY KEY CLUSTERED (Response_ID),
    CONSTRAINT FK_Response_Session FOREIGN KEY (Session_ID) REFERENCES Feedback.Sessions (Session_ID)
);

--- Invididual responses (radio buttons and checkboxes)
-------------------------------------------------

CREATE TABLE Feedback.Response_Answers (
    Response_ID     bigint NOT NULL,
    Question_ID     int NOT NULL,
    Answer_option_ID int NOT NULL,
    Created         datetime2(3) NOT NULL,
    Revision        smallint NOT NULL,
    Updated         datetime2(3) NOT NULL,
    CONSTRAINT FK_Response_Answers_Response FOREIGN KEY (Response_ID) REFERENCES Feedback.Responses (Response_ID),
    CONSTRAINT FK_Response_Answers_Question FOREIGN KEY (Question_ID) REFERENCES Feedback.Questions (Question_ID),
    CONSTRAINT FK_Response_Answers_Options FOREIGN KEY (Answer_option_ID) REFERENCES Feedback.Answer_options (Answer_option_ID),
    CONSTRAINT PK_Response_Answers PRIMARY KEY CLUSTERED (Response_ID, Question_ID, Answer_option_ID)
);

--- Plaintext responses
-------------------------------------------------

CREATE TABLE Feedback.Response_Plaintext (
    Response_ID     bigint NOT NULL,
    Question_ID     int NOT NULL,
    Plaintext       nvarchar(max) NOT NULL,
    Created         datetime2(3) NOT NULL,
    Revision        smallint NOT NULL,
    Updated         datetime2(3) NOT NULL,
    CONSTRAINT FK_Response_Plaintext_Response FOREIGN KEY (Response_ID) REFERENCES Feedback.Responses (Response_ID),
    CONSTRAINT FK_Response_Plaintext_Question FOREIGN KEY (Question_ID) REFERENCES Feedback.Questions (Question_ID),
    CONSTRAINT PK_Response_Plaintext PRIMARY KEY CLUSTERED (Response_ID, Question_ID)
);

GO
CREATE OR ALTER VIEW Feedback.My_Events
WITH SCHEMABINDING
AS

SELECT e.Event_ID, e.[Name], e.CSS, e.Is_template, e.Accepts_responses_from, e.Accepts_responses_to, Sessionize_API_key
FROM Feedback.[Events] AS e
LEFT JOIN Feedback.Event_users AS eu ON e.Event_ID=eu.Event_ID
WHERE eu.[User]=SUSER_SNAME()
   OR USER=N'dbo';

GO
CREATE OR ALTER VIEW Feedback.My_Sessions
WITH SCHEMABINDING
AS

SELECT s.Session_ID, s.Event_ID, s.Title
FROM Feedback.My_Events AS e
INNER JOIN Feedback.[Sessions] AS s ON e.Event_ID=s.Event_ID

GO
CREATE OR ALTER VIEW Feedback.My_Questions
WITH SCHEMABINDING
AS

SELECT q.Question_ID, q.Event_ID, q.Display_order, q.Question, q.Is_required, q.Has_plaintext
FROM Feedback.My_Events AS e
INNER JOIN Feedback.Questions AS q ON e.Event_ID=q.Event_ID

GO
CREATE OR ALTER VIEW Feedback.My_Answer_Options
WITH SCHEMABINDING
AS

SELECT q.Event_ID, a.Question_ID, a.Answer_Option_ID, a.Answer_ordinal, a.Percent_value, a.If_selected_show_Question_ID, a.Annotation
FROM Feedback.My_Events AS e
INNER JOIN Feedback.Questions AS q ON e.Event_ID=q.Event_ID
INNER JOIN Feedback.Answer_options AS a ON q.Question_ID=a.Question_ID

GO
CREATE OR ALTER VIEW Feedback.Question_Indent
WITH SCHEMABINDING
AS

WITH cte AS (
    SELECT Question_ID, 0 AS Indent, If_selected_show_Question_ID
    FROM Feedback.Answer_options
    WHERE Question_ID NOT IN (
        SELECT If_selected_show_Question_ID
        FROM Feedback.Answer_options
        WHERE If_selected_show_Question_ID IS NOT NULL)

    UNION ALL

    SELECT ao.Question_ID, cte.Indent+1, ao.If_selected_show_Question_ID
    FROM cte
    INNER JOIN Feedback.Answer_options AS ao ON cte.If_selected_show_Question_ID=ao.Question_ID)

SELECT Question_ID, MAX(Indent) AS Indent
FROM cte
GROUP BY Question_ID

GO

