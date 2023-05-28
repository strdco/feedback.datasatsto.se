var statusTimeoutId;

window.onload = function whatsUp() {

    const docPath=document.location.pathname.substring(1);

    // Create the status bar
    var statusbarDiv=document.createElement('div');
    statusbarDiv.classList.add('statusbar');
    statusbarDiv.classList.add('hidden');
    document.body.appendChild(statusbarDiv);


    // Add an event handler to the "Import" button:
    document.getElementById('doImport').addEventListener('click', doImport);


    // If the path is entirely numeric, we're reviewing a session:
    var xhr = new XMLHttpRequest();

    xhr.onload = function() {
        if (xhr.status == 200) {
            try {
                var select=document.getElementById("template");

                const templates=JSON.parse(xhr.response);
                for (const template of templates) {
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

    var postBody=
        'eventName='+encodeURIComponent(eventName.value)+'&'+
        'apikey='+encodeURIComponent(apikey.value)+'&'+
        'templateName='+encodeURIComponent(templateName.value);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/import-sessionize');
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

    xhr.onload = function() {
        theButton.disabled=false;

        var blob;

        try {
            blob=JSON.parse(xhr.response);

            document.getElementById('eventsecret').value=blob.eventSecret;
        } catch {
            blob={ "status": "error", "message": "Bad things have happened." };
        }

        if (xhr.status==200) {
            showStatus('Saved', 'good');
        } else {
            showStatus(blob.message || 'There was a problem importing the event.', 'bad');
        }
    }

    theButton.disabled=true;
    xhr.send(postBody);
}
