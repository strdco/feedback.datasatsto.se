    var clientKey;
    var responseId;
    var statusTimeoutId;

    window.onload = function whatsUp() {

        // Create the status bar
        var statusbarDiv=document.createElement('div');
        statusbarDiv.classList.add('statusbar');
        statusbarDiv.classList.add('hidden');
        document.body.appendChild(statusbarDiv);

        // If the path is entirely numeric, we're reviewing a session:
        var docPath=document.location.pathname.substring(1);
        if (isFinite(docPath) && docPath!='') {

            var xhr = new XMLHttpRequest();

            xhr.onload = function() {
                if (xhr.status == 200) {
                    try {
                        var blob=JSON.parse(xhr.response);
                        clientKey = blob.clientKey;
                        responseId = blob.responseId;
                        renderHeader(blob);
                        renderQuestions(blob.questions);
                    } catch(err) {
                        // TODO
                        console.log(err);
                    }
                }
            }
    
            xhr.open('GET', '/api/create-response/'+docPath);
            xhr.send();
        }
    }

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




    function renderHeader(blob) {
        var header=document.createElement('div');
        header.classList.add('header');

        var title=document.createElement('span');
        title.classList.add('title');
        title.innerText=blob.title;
        header.appendChild(title);

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

    function renderQuestions(questions) {
        /*
        *
        * Render question divs.
        *
        */

        questions.forEach(q => {
            var qdiv=document.createElement('div');
            qdiv.classList.add('question');
            if (q.isRequired) { qdiv.classList.add('required'); }
            if (q.hasPercentages) { qdiv.classList.add('has-percentages'); }
            qdiv.id='question'+q.questionId;
            var span=document.createElement('span');
            span.innerText=q.question;
            span.classList.add('question-text');
            qdiv.appendChild(span);
            if (q.type!='text' && q.description) {
                var span2=document.createElement('span');
                span2.innerText=q.description;
                span2.classList.add('question-description');
                qdiv.appendChild(span2);
            }
            if (q.display==false) { qdiv.style.display='none'; }


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
                            document.querySelector('div#question'+a.followUpQuestionId).style.display='block';
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
                txtArea.addEventListener('focus', () => {
                    txtArea.style.height='4em';
                });
                txtArea.addEventListener('blur', () => {
                    if (txtArea.value=='') {
                        txtArea.style.height='inherit';
                    }
                });
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

