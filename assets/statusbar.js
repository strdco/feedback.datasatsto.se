/*
 *
 *
 * ----------------------------------------------------------------------------
 * Status bar.
 * ----------------------------------------------------------------------------
 * 
 * 
 */
    var statusTimeoutId;

    window.addEventListener('load', () => {

        // Create the status bar
        //---------------------------------------------------------------------
        var statusbarDiv=document.createElement('div');
        statusbarDiv.classList.add('statusbar');
        statusbarDiv.classList.add('hidden');
        document.body.appendChild(statusbarDiv);
    });



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


