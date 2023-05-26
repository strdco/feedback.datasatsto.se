DECLARE @Name nvarchar(200)=N'Data Saturday template';


IF (EXISTS (SELECT NULL FROM Feedback.[Events] WHERE Is_template=1 AND [Name]=@Name))
    THROW 50001, 'Template already exists.', 1;

DECLARE @Template_ID int, @Target_ID int, @Question_ID int;

DECLARE @id TABLE (
    Seq int IDENTITY(0, 1) NOT NULL,
    ID int NOT NULL
);

BEGIN TRANSACTION;

    --- Create the event
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Event @Name=@Name, @Is_template=1;
    SELECT @Template_ID=ID FROM @id WHERE Seq=0;

    --- 1.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'Overall impression', @Is_required=1, @Has_plaintext=0, @Type='radio', @Display_order=1;
    --- 2.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'What happened?', @Is_required=0, @Has_plaintext=1, @Type='checkbox', @Display_order=2;
    --- 3.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'What issues did you have understanding the speaker?', @Is_required=0, @Has_plaintext=1, @Type='checkbox', @Display_order=3;
    --- 4.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'What affected the timing?', @Is_required=0, @Has_plaintext=0, @Type='checkbox', @Display_order=4;
    --- 5.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'Speaker''s knowledge', @Description='in relation to the presentation', @Is_required=0, @Has_plaintext=0, @Display_order=5, @Type='radio';
    --- 6.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'Did you learn something?', @Is_required=0, @Has_plaintext=0, @Display_order=6, @Type='radio';
    --- 7.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'How was the level?', @Description='in relation to the session abstract', @Is_required=0, @Has_plaintext=0, @Display_order=7, @Type='radio';
    --- 8.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'What about the tempo?', @Is_required=0, @Has_plaintext=0, @Display_order=8, @Type='radio';
    --- 9.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'Was the presenter engaging?', @Is_required=0, @Has_plaintext=0, @Display_order=9, @Type='radio';
    --- 10.
    INSERT INTO @id (ID) EXECUTE Feedback.Create_Question @Event_ID=@Template_ID, @Question=N'Feedback to the presenter', @Description='Try to give constructive feedback.', @Is_required=0, @Has_plaintext=8, @Type='text', @Display_order=10;

    --- Answers to 1.
    SELECT @Question_ID=ID FROM @id WHERE Seq=1;
    SELECT @Target_ID=ID FROM @id WHERE Seq=2;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=1, @Percent_value=0, @CSS_classes=N'bad', @Annotation='Terrible', @If_selected_show_Question_ID=@Target_ID;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=2, @Percent_value=20, @CSS_classes=N'bad', @If_selected_show_Question_ID=@Target_ID;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=3, @Percent_value=40, @CSS_classes=N'bad', @If_selected_show_Question_ID=@Target_ID;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=4, @Percent_value=60, @CSS_classes=N'avg', @If_selected_show_Question_ID=@Target_ID;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=5, @Percent_value=80, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=6, @Percent_value=100, @CSS_classes=N'good', @Annotation='Outstanding';

    --- Answers to 2.
    SELECT @Question_ID=ID FROM @id WHERE Seq=2;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Did not align with abstract.';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Could not understand slides or demos.';

    SELECT @Target_ID=ID FROM @id WHERE Seq=4;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Went over time.', @If_selected_show_Question_ID=@Target_ID;

    SELECT @Target_ID=ID FROM @id WHERE Seq=3;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Could not understand presenter.', @If_selected_show_Question_ID=@Target_ID;

    --- Answers to 3.
    SELECT @Question_ID=ID FROM @id WHERE Seq=3;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Audio/microphone issues.';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Poor acoustics in the room.';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Language/accent hard to understand.';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Speaking too fast.';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Speaking too quietly.';

    --- Answers to 4.
    SELECT @Question_ID=ID FROM @id WHERE Seq=4;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Started late.';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Rushed the presentation.';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Annotation='Not enough time for questions.';

    --- Answers to 5.
    SELECT @Question_ID=ID FROM @id WHERE Seq=5;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=1, @Percent_value=0, @CSS_classes=N'bad', @Annotation='Beginner';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=2, @Percent_value=20, @CSS_classes=N'bad';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=3, @Percent_value=40, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=4, @Percent_value=60, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=5, @Percent_value=80, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=6, @Percent_value=100, @CSS_classes=N'good', @Annotation='Expert';

    --- Answers to 6.
    SELECT @Question_ID=ID FROM @id WHERE Seq=6;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=1, @Percent_value=0, @CSS_classes=N'bad', @Annotation='Nothing';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=2, @Percent_value=20, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=3, @Percent_value=40, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=4, @Percent_value=60, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=5, @Percent_value=80, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=6, @Percent_value=100, @CSS_classes=N'good', @Annotation='Lots';

    --- Answers to 7.
    SELECT @Question_ID=ID FROM @id WHERE Seq=7;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=1, @Percent_value=0, @CSS_classes=N'bad', @Annotation='Too easy';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=2, @Percent_value=20, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=3, @Percent_value=40, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=4, @Percent_value=60, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=5, @Percent_value=80, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=6, @Percent_value=100, @CSS_classes=N'bad', @Annotation='Too hard';

    --- Answers to 8.
    SELECT @Question_ID=ID FROM @id WHERE Seq=8;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=1, @Percent_value=0, @CSS_classes=N'bad', @Annotation='Too slow';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=2, @Percent_value=20, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=3, @Percent_value=40, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=4, @Percent_value=60, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=5, @Percent_value=80, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=6, @Percent_value=100, @CSS_classes=N'bad', @Annotation='Too fast';

    --- Answers to 9.
    SELECT @Question_ID=ID FROM @id WHERE Seq=9;
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=1, @Percent_value=0, @CSS_classes=N'bad', @Annotation='Not at all';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=2, @Percent_value=20, @CSS_classes=N'bad';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=3, @Percent_value=40, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=4, @Percent_value=60, @CSS_classes=N'avg';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=5, @Percent_value=80, @CSS_classes=N'good';
    EXECUTE Feedback.Create_Answer_option @Question_ID=@Question_ID, @Answer_ordinal=6, @Percent_value=100, @CSS_classes=N'good', @Annotation='Yes, very';

COMMIT TRANSACTION;
