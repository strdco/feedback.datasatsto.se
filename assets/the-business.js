    var clientKey;
    var responseId;
    var statusTimeoutId;
    var searchTimeout;

/*
 *
 *
 * ----------------------------------------------------------------------------
 * Entry point for the page.
 * ----------------------------------------------------------------------------
 * 
 * 
 */

    window.onload = function whatsUp() {

        const docPath=document.location.pathname.substring(1);

        // Create the status bar
        //---------------------------------------------------------------------
        var statusbarDiv=document.createElement('div');
        statusbarDiv.classList.add('statusbar');
        statusbarDiv.classList.add('hidden');
        document.body.appendChild(statusbarDiv);



        // If the path is entirely numeric, we're reviewing a session:
        //---------------------------------------------------------------------
        if (isFinite(docPath) && docPath!='') {
            var xhr = new XMLHttpRequest();

            xhr.onload = function() {
                if (xhr.status == 200) {
                    try {
                        const blob=JSON.parse(xhr.response);
                        clientKey = blob.clientKey;
                        responseId = blob.responseId;
                        renderHeader(blob);
                        renderQuestions(blob.questions);
                        renderFooter();
                    } catch(err) {
                        showStatus('An unknown issue occurred. Sorry about that.', 'bad');
                    }
                } else {
                    showStatus('That link is invalid or has expired.', 'bad');
                }
            }

            xhr.open('GET', '/api/create-response/'+docPath);
            xhr.send();
        }



        // If we're listing sessions to review,
        // or listing sessions for one speaker:
        //---------------------------------------------------------------------
        if (docPath=='sessions' || docPath=='speaker') {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/sessions');
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

            xhr.onload = function() {
                if (xhr.status==200) {
                    const blob=JSON.parse(xhr.response);

                    if (docPath=='sessions') {
                        renderSessionHeader(blob[0].css);
                        renderSessionList(blob);
                    }

                    if (docPath=='speaker') {
                        renderSpeakerPage(blob);
                    }
                }
            }

            xhr.send(document.location.search.substring(1));
        }





        // If we're on the admin page, show the search field:
        //---------------------------------------------------------------------
        if (docPath=='admin') {
            renderAdminHeader();
        }


    }




/*
 *
 *
 * ----------------------------------------------------------------------------
 * Status bar.
 * ----------------------------------------------------------------------------
 * 
 * 
 */

    function showStatus(statusText, cssClass) {
        // If already visible, cancel the scheduled fade-out.
        if (statusTimeoutId) {
            clearTimeout(statusTimeoutId);
            statusTimeoutId=null;
        }

        var statusbarDiv=document.getElementsByClassName('statusbar')[0];
        statusbarDiv.innerText=statusText;

        // Remove all the current CSS classes:
        statusbarDiv.classList='statusbar';

        // Add a particular CSS class
        if (cssClass) {
            statusbarDiv.classList.add(cssClass);
        }

        // Schedule a new fade-out:
        statusTimeoutId=setTimeout(hideStatus, 1000);
    }

    function hideStatus() {
        document.getElementsByClassName('statusbar')[0].classList.add('hidden');
    }



/*
 *
 *
 * ----------------------------------------------------------------------------
 * Speaker page.
 * ----------------------------------------------------------------------------
 * 
 * 
 */

    function renderSpeakerPage(blob) {
        document.body.classList.add('speaker-page');

        if (blob[0].css) {
            var l=document.createElement('link');
            l.rel='stylesheet';
            l.href=blob[0].css;
            document.head.appendChild(l);
        }

        blob.forEach(async session => {

            var div=document.createElement('div');
            div.classList.add('session');

            // Add the QR code image,
            var img=document.createElement('img');
            img.src=document.location.protocol.replace(':', '')+'://'+document.location.host+'/qr/'+session.sessionId;
            img.addEventListener('click', async (e) => {
                var rng=new Range();
                rng.selectNode(e.target);
                document.getSelection().empty();
                document.getSelection().addRange(rng);

                const data = await fetch(e.target.src);
                const blob = await data.blob();
                await navigator.clipboard.write([
                  new ClipboardItem({
                    [blob.type]: blob
                  })
                ]);
                showStatus('Copied.', 'good');
            });
            div.appendChild(img);

            // ... the speaker name(s),
            var span=document.createElement('span');
            span.innerText=session.presenters.map(presenter => { return(presenter.name); }).join(', ');;
            div.appendChild(span);

            // ... the session title,
            var span=document.createElement('span');
            span.classList.add('title');
            span.innerText=session.title;
            div.appendChild(span);

            // ... and the URL
            var a=document.createElement('a');
            a.innerText=document.location.protocol.replace(':', '')+'://'+document.location.host+'/'+session.sessionId;
            a.href=document.location.protocol.replace(':', '')+'://'+document.location.host+'/'+session.sessionId;
            div.appendChild(a);

            document.body.appendChild(div);
        });
    }

/*
 *
 *
 * ----------------------------------------------------------------------------
 * Admin page.
 * ----------------------------------------------------------------------------
 * 
 * 
 */

    function renderAdminHeader() {
        document.body.classList.add('admin-page');
        document.title='Admin';

        var input=document.createElement('input');
        input.classList.add('secret-key');
        input.type='password';
        input.placeholder='0000000-0000-0000-0000-000000000000';
        input.addEventListener("keyup", (e) => {
            //e.preventDefault();
            if (e.code=='Enter' && e.target.value) {
                loadAdminInfo(e.target.value);
            };
        });

        document.body.appendChild(input);
    }


    function loadAdminInfo(eventSecret) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/get-admin-sessions');
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

        xhr.onload = function() {
            if (xhr.status==200) {
                var blob;
                try {
                    blob=JSON.parse(xhr.response);
                    showStatus('Authenticated.', 'good');
                } catch(e) {
                    showStatus('That doesn\'t look right.', 'bad');
                    return;
                }

                blob.sessions.forEach(async session => {

                    var div=document.createElement('div');
                    div.classList.add('session');

                    // Add the QR code image,
                    var img=document.createElement('img');
                    img.src=document.location.protocol.replace(':', '')+'://'+document.location.host+'/qr/'+session.sessionId;
                    img.addEventListener('click', async (e) => {
                        var rng=new Range();
                        rng.selectNode(e.target);
                        document.getSelection().empty();
                        document.getSelection().addRange(rng);

                        const data = await fetch(e.target.src);
                        const blob = await data.blob();
                        await navigator.clipboard.write([
                        new ClipboardItem({
                            [blob.type]: blob
                        })
                        ]);
                        showStatus('Copied.', 'good');
                    });
                    div.appendChild(img);

                    // ... the speaker name(s),
                    var span=document.createElement('span');
                    span.innerText=session.presenters.map(presenter => { return(presenter.name); }).join(', ');;
                    div.appendChild(span);

                    // ... the session title,
                    var span=document.createElement('span');
                    span.classList.add('title');
                    span.innerText=session.title;
                    div.appendChild(span);

                    // ... and the URL
                    var a=document.createElement('a');
                    a.innerText=document.location.protocol.replace(':', '')+'://'+document.location.host+'/'+session.sessionId;
                    a.href=document.location.protocol.replace(':', '')+'://'+document.location.host+'/'+session.sessionId;
                    div.appendChild(a);

                    document.body.appendChild(div);
                });

            } else {
                showStatus('But there was a problem.', 'bad');
            }
        }

        xhr.send('eventSecret='+encodeURIComponent(eventSecret));
    }


/*
 *
 *
 * ----------------------------------------------------------------------------
 * Feedback page.
 * ----------------------------------------------------------------------------
 * 
 * 
 */

    function renderHeader(blob) {
        document.body.classList.add('review-page');
        document.title='Feedback: '+blob.title;

        var header=document.createElement('div');
        header.classList.add('header');

        var title=document.createElement('span');
        title.classList.add('title');
        title.innerText=blob.title;
        header.appendChild(title);

        if (blob.css) {
            var l=document.createElement('link');
            l.rel='stylesheet';
            l.href=blob.css;
            document.head.appendChild(l);
        }

        var speakers=document.createElement('ul');
        speakers.classList.add('speakers');
        for (var speaker of blob.speakers) {
            var li=document.createElement('li');
            li.innerText=speaker.name;
            speakers.appendChild(li);
        }
        header.appendChild(speakers);
        document.body.appendChild(header);
    }

    function renderFooter() {
        var footer=document.createElement('div');
        footer.classList='footer';

        var button=document.createElement('button');
        button.classList='done';
        button.innerText='Done';
        button.addEventListener('click', () => {
            location.href='/sessions?responseId='+encodeURIComponent(responseId)+'&clientKey='+encodeURIComponent(clientKey);
        });
        footer.appendChild(button);

        document.body.appendChild(footer);
    }

    function renderQuestions(questions) {

        questions.forEach(q => {

            // The question DIV
            var qdiv=document.createElement('div');
            qdiv.classList.add('question');
            if (q.isRequired) { qdiv.classList.add('required'); }
            if (q.hasPercentages) { qdiv.classList.add('has-percentages'); }
            if (q.display==false) { qdiv.classList.add('hidden'); }
            qdiv.id='question'+q.questionId;

            // Indent this question DIV?
            if (q.indent) {
                qdiv.classList.add('indented');
                qdiv.style.top=-0.25*q.indent+'em';
                qdiv.style.left=0.5*q.indent+'em';
            }

            // Create the title of the question
            var span=document.createElement('span');
            span.innerText=q.question;
            span.classList.add('question-text');
            qdiv.appendChild(span);

            // If the question has a description text
            // (except if it's purely a text field)
            if (q.type!='text' && q.description) {
                var span2=document.createElement('span');
                span2.innerText=q.description;
                span2.classList.add('question-description');
                qdiv.appendChild(span2);
            }

            // If there are answer options, render those
            if (q.options) {
                var adiv=document.createElement('div');
                adiv.classList.add('answers');
                q.options.forEach(a => {
                    var div=document.createElement('label');
                    div.classList.add('answer');

                    var opt=document.createElement('input');
                    opt.name='opt'+q.questionId;
                    opt.value=a.answer_ordinal;
                    if (q.type=='checkbox') {
                        adiv.classList.add('checkboxes');

                        var lbl=document.createElement('label');
                        var span=document.createElement('span');
                        opt.type='checkbox';
                        span.innerText=a.annotation;
                        lbl.appendChild(opt);
                        lbl.appendChild(span);
                        div.appendChild(lbl);        
                    } else {
                        opt.type=(q.type || 'radio');
                        div.appendChild(opt);
                    }

                    opt.addEventListener('change', () => {
                        var ordinal=opt.value;
                        if (opt.type=='checkbox' && !opt.checked) { ordinal=-parseInt(opt.value); }
                        saveInput(q.questionId, ordinal, null);
                    });
                    adiv.appendChild(div);

                    // If the answer option has an associated question
                    // associated with it, add an onclick event to display
                    // that question when the option is clicked.
                    if (a.followUpQuestionId) {
                        opt.addEventListener('click', () => {
                            var followUp=document.querySelector('div#question'+a.followUpQuestionId);
                            followUp.classList.remove('hidden');
                        });
                    }

                    // If the answer option has a CSS class associated with it,
                    // add an onclick event to apply that class, but also
                    // remember to clear out any class we've previously set.
                    if (a.classList) {
                        opt.addEventListener('click', () => {

                            for (var className of qdiv.classList) {
                                if (className.substring(0, 1)=='-') {
                                    qdiv.classList.remove(className);
                                    qdiv.classList.remove(className.substring(1));
                                }
                            }

                            for (var className of a.classList.split(' ')) {
                                qdiv.classList.add(className);
                                qdiv.classList.add('-'+className);
                            }
                        });
                    }

                });
                qdiv.appendChild(adiv);

                if (q.type=='radio') {
                    var tdiv=document.createElement('div');
                    tdiv.classList.add('annotations');
                    q.options.filter(o => o.annotation).forEach(a => {
                        var div=document.createElement('div');
                        div.classList.add('annotation');
                        div.innerText=a.annotation;
                        tdiv.appendChild(div);
                    });
                    qdiv.appendChild(tdiv);
                }
            }

            // Is there a text area for the user to give comments?
            if (q.allowPlaintext) {
                var txtArea=document.createElement('textarea');
                if (q.description) {
                    txtArea.placeholder=q.description;
                } else if (q.type!='text') {
                    txtArea.placeholder='Use this field to elaborate.';
                }
                qdiv.appendChild(txtArea);
                txtArea.addEventListener('change', () => {
                    saveInput(q.questionId, null, txtArea.value);
                });
            }

            document.body.appendChild(qdiv);
        });
    }

    function saveInput(questionId, answerOrdinal, plaintext) {
        var postBody=
            'responseId='+encodeURIComponent(responseId)+'&'+
            'clientKey='+encodeURIComponent(clientKey)+'&'+
            'questionId='+encodeURIComponent(questionId)+'&'+
            'answerOrdinal='+encodeURIComponent(answerOrdinal)+'&'+
            'plaintext='+encodeURIComponent(plaintext);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/save');
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

        xhr.onload = function() {
            if (xhr.status==200) {
                showStatus('Saved', 'good');
            } else {
                showStatus('There was a problem saving your data', 'bad');
            }
        }

        xhr.send(postBody);
    }


/*
 *
 *
 * ----------------------------------------------------------------------------
 * Feedback session list.
 * ----------------------------------------------------------------------------
 * 
 * 
 */

    // Create the header and search field for the session list:
    function renderSessionHeader(css) {
        document.body.classList.add('sessions-page');

        if (css) {
            var l=document.createElement('link');
            l.rel='stylesheet';
            l.href=css;
            document.head.appendChild(l);
        }

        var search=document.createElement('input');
        search.classList.add('search');
        search.placeholder='Search sessions...';

        search.addEventListener("change", searchChangedEvent);
        search.addEventListener("keyup", searchChangedEvent);

        document.body.appendChild(search);
    }

    // Render the list of all sessions for this event:
    function renderSessionList(sessions) {
        for (var session of sessions) {
            var div=document.createElement('div');
            div.classList.add('session');

            var title=document.createElement('a');
            title.classList.add('title');
            title.href='/'+session.sessionId;
            title.innerText=session.title;

            var speakers=document.createElement('span');
            speakers.classList.add('speakers');
            speakers.innerText=session.presenters.map(presenter => { return(presenter.name); }).join(', ');

            div.appendChild(title);
            div.appendChild(speakers);

            document.body.appendChild(div);
        }
    }

    // Wait 500 ms after last keypress before we search
    function searchChangedEvent(e) {
        clearTimeout(searchTimeout);
        searchTimeout=setTimeout(filterSessionList, 500);
    }

    function filterSessionList() {
        var filterString=document.getElementsByClassName('search')[0].value.toLowerCase();
        var sessionDivs=Array.from(document.getElementsByClassName('session'));

        sessionDivs.forEach(div => {
            if (div.innerText.toLowerCase().indexOf(filterString)>=0) {
                div.classList.remove('hidden');
            } else {
                div.classList.add('hidden');
            }
        })
    }



/*
 *
 *
 * ----------------------------------------------------------------------------
 * Mixed/utility stuff.
 * ----------------------------------------------------------------------------
 * 
 * 
 */

    // https://stackoverflow.com/a/20285053/5471286
    const toDataURL = url => fetch(url)
    .then(response => response.blob())
    .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    }));
