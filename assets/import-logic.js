var templateList=[];

window.onload = function whatsUp() {

    // Add an event handler to the "Import" button:
    document.getElementById('doImport').addEventListener('click', doImport);

    importTemplates();
    importStylesheets();
}

function importTemplates() {

    // Populate the template dropdown:
    var select=document.getElementById("template");
    var xhr = new XMLHttpRequest();

    xhr.onload = function() {
        if (xhr.status == 200) {
            try {

                const templates=JSON.parse(xhr.response);
                for (const template of templates) {
                    if (template.css) {
                        templateList.push({ "name": template.name, "css": template.css });
                    }

                    var option=document.createElement('option');
                    option.value=template.name;
                    option.innerText=template.name;
                    select.appendChild(option);
                }

            } catch(err) {
                // TODO
                console.log(err);
            }
        }
    }

    xhr.open('GET', '/api/get-templates');
    xhr.send();

    // Add an event handler to the template dropdown:
    select.addEventListener('change', (e) => {
        if (e.target.value) {
            var cssSelect=document.querySelector('select#css');
            cssSelect.value=templateList.filter(template => template.name==e.target.value)[0].css;
            cssSelect.dispatchEvent(new Event('change'));
        }
    });
}

function importStylesheets() {

    // Populate the template dropdown:
    var select=document.getElementById("css");
    var xhr = new XMLHttpRequest();

    xhr.onload = function() {
        if (xhr.status == 200) {
            try {

                const stylesheets=JSON.parse(xhr.response);
                for (const stylesheet of stylesheets) {
                    var option=document.createElement('option');
                    option.value=stylesheet;
                    option.innerText=stylesheet;
                    select.appendChild(option);
                }

            } catch(err) {
                // TODO
                console.log(err);
            }
        }
    }

    xhr.open('GET', '/api/get-stylesheets');
    xhr.send();

    // Add an event handler to the template dropdown:
    select.addEventListener('change', (e) => {
        if (e.target.value) {
            document.querySelector('link#dynamiccss').href=e.target.value;
        }
    });

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




function doImport() {

    var eventName=document.getElementById('eventname');
    var apikey=document.getElementById('sessionizekey');
    var templateName=document.getElementById('template');
    var masterPassword=document.getElementById('masterPassword');
    var css=document.getElementById('css');

    var theButton=document.getElementsByTagName('button')[0];

    if (!eventName.value) {
        showStatus('Event name missing', 'bad');
        eventName.focus();
        return;
    }

    if (!apikey.value) {
        showStatus('Sessionize API endpoint missing', 'bad');
        apikey.focus();
        return;
    }

    if (!masterPassword.value) {
        showStatus('You need to specify the master password.', 'bad');
        masterPassword.focus();
        return;
    }

    var postBody=
        'eventName='+encodeURIComponent(eventName.value)+'&'+
        'apikey='+encodeURIComponent(apikey.value)+'&'+
        'templateName='+encodeURIComponent(templateName.value)+'&'+
        'masterPassword='+encodeURIComponent(masterPassword.value)+'&'+
        'css='+encodeURIComponent(css.value);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/import-sessionize');
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

    xhr.onload = function() {
        theButton.disabled=false;

        var blob;

        try {
            blob=JSON.parse(xhr.response);

            document.getElementById('eventsecret').value=blob.eventSecret || 'Event secret not shown when updating an existing event.';
        } catch {
            blob={ "status": "error", "message": "Bad things have happened." };
        }

        if (xhr.status==200) {
            showStatus('Event created!', 'good');
        } else {
            showStatus(blob.message || 'There was a problem importing the event.', 'bad');
        }
    }

    theButton.disabled=true;
    try {
        xhr.send(postBody);
    } catch(e) {
        showStatus('Something went wrong with the API call.', 'bad');
        theButton.disabled=false;
    }
}
