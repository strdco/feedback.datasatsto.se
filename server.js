#!/usr/bin/env node



// Core modules:
const fs = require('fs');
const path = require('path');
const https = require('https');

// Canned SQL query interface:
const cannedSql=require('./canned-sql.js');

// QR Code module:
const qr = require('qrcode'); // https://www.npmjs.com/package/qrcode

// Other modules:
const express = require('express');
const cookieSession = require('cookie-session');

// HTTP port that the server will run on:
var serverPort=process.argv[2] || process.env.PORT || 3000;

// The web server itself:
const app = express();
app.disable('etag');
app.disable('x-powered-by');
app.enable('trust proxy');

app.use(express.json());
app.use(express.urlencoded( { extended: true }));

app.use(cookieSession({
    name: 'session',
    secret: (process.env.cookieSecret || 'dev'),
    rolling: true,
    secure: !(serverPort==3000),        // on dev environment only, allow cookies even without HTTPS.
    sameSite: true,
    resave: true,
    maxAge: 24 * 60 * 60 * 1000         // 24 little hours
}));

// Connection string to the SQL Database:
var connectionString = {
    server: process.env.dbserver,
    authentication: {
        type      : 'default',
        options   : {
            userName  : process.env.dblogin,
            password  : process.env.dbpassword
        }
    },
    options: { encrypt        : true,
               database       : process.env.dbname,
               connectTimeout : 20000,   // 20 seconds before connection attempt times out.
               requestTimeout : 30000,   // 20 seconds before request times out.
               rowCollectionOnRequestCompletion : true,
               dateFormat     : 'ymd',
               appName        : 'feedback.datasatsto.se' // host name of the web server
        }
    };

function sendFileOptions(root, maxAge) {

    return({
        maxAge: maxAge,
        root: __dirname + (root || '/'),
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    });
}



/*-----------------------------------------------------------------------------
  Start the web server
-----------------------------------------------------------------------------*/

console.log('');
console.log('HTTP port:       '+serverPort);
console.log('Database server: '+process.env.dbserver);
console.log('Express env:     '+app.settings.env);
console.log('');
console.log('');

app.listen(serverPort, () => console.log('READY.'));






















/*-----------------------------------------------------------------------------
  Default URL: redirect to the admin page.
  ---------------------------------------------------------------------------*/

app.get('/', function (req, res, next) {

    httpHeaders(res);
    res.redirect('/admin');
    return;

});







/*-----------------------------------------------------------------------------
  Evaluate a new session
  ---------------------------------------------------------------------------*/

app.get('/:sessionid([0-9]*)', function (req, res, next) {
    httpHeaders(res);

    res.status(200).sendFile('template.html', sendFileOptions('/', 60 * 60 * 1000), function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });

    return;
});

// Get the questions and answer options for a session
app.get('/api/create-response/:sessionid', async function (req, res, next) {
    httpHeaders(res);
    var sessionId;
    try {
        sessionId=await initResponse(req.params.sessionid)
        res.status(200).send(sessionId);
    } catch {
        res.status(404).send();
    }
});

// Save responses - fires every time a user makes/changes a selection
app.post('/api/save', async function (req, res, next) {

    var responseId=parseInt(req.body.responseId);
    var clientKey=req.body.clientKey;
    var questionId=parseInt(req.body.questionId);
    var answerOrdinal=parseInt(req.body.answerOrdinal) || null;
    var plaintext=req.body.plaintext;

    var output=await saveResponse(responseId, clientKey, questionId, answerOrdinal, plaintext);
    if (output.error) {
        res.status(500).send({ "status": "error" });
    } else {
        res.status(200).send({ "status": "ok" });
    }

});







/*-----------------------------------------------------------------------------
  List sessions.

  Users arrive here when they click the "Done" button on the eval form.
  ---------------------------------------------------------------------------*/

app.get('/sessions', function(req, res, next) {
    httpHeaders(res);

    res.status(200).sendFile('template.html', sendFileOptions('/', 60 * 60 * 1000), function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });

    return;
});

app.post('/api/sessions', async function (req, res, next) {
    httpHeaders(res);

    var responseId=parseInt(req.body.responseId);
    var clientKey=req.body.clientKey;
    var presenterId=parseInt(req.body.presenterId);
    var eventId=req.body.eventId;

    if (responseId && clientKey) {
        try {
            res.status(200).send(await listSessions(responseId, clientKey));
        } catch(e) {
            res.status(401).send();
        }
    } else if (presenterId && eventId) {
        try {
            res.status(200).send(await listPresenterSessions(presenterId, eventId));
        } catch(e) {
            res.status(401).send();
        }
    } else {
        res.status(401).send();
    }
});







/*-----------------------------------------------------------------------------
  The admin page

  Lists all sessions for an event, with the QR code, speaker name, session
  name, and a URL to the evaluation form.
  ---------------------------------------------------------------------------*/

app.get('/admin', function(req, res, next) {
    httpHeaders(res);

    res.status(200).sendFile('template.html', sendFileOptions('/', 60 * 60 * 1000), function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });

    return;
});

// Get list of sessions for the event.
app.post('/api/get-admin-sessions', async function (req, res, next) {

    var eventSecret=req.body.eventSecret.trim();
    var blob;
    try {
        blob=await adminEventInfo(eventSecret);
        res.status(200).send(blob);
    } catch(e) {
        res.status(401).send();
    }

});







/*-----------------------------------------------------------------------------
  QR code stuff
  ---------------------------------------------------------------------------*/

// Send the QR code for this 
app.get('/qr/:sessionid([0-9]*)', async function (req, res, next) {

    const dir=__dirname+'/qr';
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir); }

    const file=dir+'/'+req.params.sessionid+'.png';
    const url='https://'+req.headers.host+'/'+req.params.sessionid;

    // Create the PNG file:
    if (!fs.existsSync(file)) {
        try {
            await createQrFile(file, url);
        } catch(e) {
            console.log(e);
        }
    }

    // ... and return it to the client:
    res.sendFile('/qr/'+req.params.sessionid+'.png', sendFileOptions('/', 60 * 60 * 1000), function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });
});


// Generate the QR code image file:
async function createQrFile(file, url) {

    return new Promise((resolve, reject) => {
        qr.toFile(file, url, { type: 'png', width: 512, margin: 0 }, (err) => {
            if (err) {
                reject();
            } else {
                resolve();
            }
        });
    });

}







/*-----------------------------------------------------------------------------
  Get session from a Sessionize event

  TODO: Error handling
  TODO: Parameter for how long a session accepts responses
  ---------------------------------------------------------------------------*/

app.get('/import', function(req, res, next) {
    httpHeaders(res);

    res.status(200).sendFile('import-from-sessionize.html', sendFileOptions('/', 60 * 60 * 1000), function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });

    return;
});

// List all available event templates
app.get('/api/get-templates', async function (req, res, next) {

    httpHeaders(res);
    res.status(200).send(await listTemplates());

});

// Perform the Sessionize import
app.post('/api/import-sessionize', async function (req, res, next) {

    var eventName=req.body.eventName.trim();
    var apikey=req.body.apikey.trim();
    var templateName=req.body.templateName;
    var masterPassword=req.body.masterPassword;
    
    if (!eventName) {
        res.status(401).send({ "status": "error", "message": "You need to specify an event name." });
        return;
    }

    if (!apikey) {
        res.status(401).send({ "status": "error", "message": "You need to specify a valid Sessionize API key." });
        return;
    }

    if (!masterPassword) {
        res.status(401).send({ "status": "error", "message": "You need to specify the master password." });
        return;
    }

    if (masterPassword!=process.env.masterpassword) {
        res.status(401).send({ "status": "error", "message": "The master password was incorrect. Contact the server admin if you need help." });
        return;
    }

    var sessions;

    try {
        sessions=await getSessionizeJSON(apikey);
    } catch(e) {
        res.status(500).send({ "status": "error", "message": "There was a problem trying to connect to the Sessionize API." });
        return;
    }

    if (!sessions) {
        res.status(401).send({ "status": "error", "message": "The Sessionize API key is not valid, or it is not a JSON endpoint." });
        return;
    }

    var event=await createEvent(eventName, apikey, templateName);

    for (const session of sessions) {

        // Regular session and status accepted?
        if (session.status=='Accepted' && !session.isServiceSession) {

            console.log('Session:', session.title);

            var presenters=[];
            for (const presenter of session.speakers) {
                presenters.push(await createPresenter(presenter.name, null, presenter.id));
            }

            var sessionId=await createSession(event.eventId, session.title, session.id);

            var isOwner=true;
            for (const presenterId of presenters) {
                await createSessionPresenter(sessionId, presenterId, isOwner);
                isOwner=false;
            }

        }
    }

    res.status(200).send(event);

});

// Collect data from the Sessionize endpoint
async function getSessionizeJSON(apikey) {

    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET'
        };

        const webReq = https.request(
                'https://sessionize.com/api/v2/'+encodeURIComponent(apikey)+'/view/Sessions',
                options,
                (res) => {
            if (res.statusCode>204) {
                return reject(new Error(res.statusCode));
            }

            const body = [];
            res.on('data', (chunk) => body.push(chunk));
            res.on('end', () => {

                var resBlob;
                try {
                    // TODO: The [0] bit assumes we're not grouping sessions, i.e. returning
                    //       all sessions ungrouped.
                    resBlob = JSON.parse(Buffer.concat(body))[0].sessions;
                } catch {
                    //
                }
                resolve(resBlob);
            });
        });

        webReq.on('error', (err) => {
            reject(err);
        })

        webReq.on('timeout', () => {
            webReq.destroy();
            reject(new Error('Request time out'));
        })

        webReq.end();

    });
}







/*-----------------------------------------------------------------------------
  Generate the event report
  ---------------------------------------------------------------------------*/

app.get('/api/report/:eventsecret', async function(req, res, next) {
    httpHeaders(res);

    try {
        const report=await getReport(req.params.eventsecret);
        res.status(200).send(report);
    } catch(e) {
        console.log(e);
        res.status(401).send();
    }

});







/*-----------------------------------------------------------------------------
  Other related assets, like images, CSS or other files.

  They should all be in the "assets" folder, in order to prevent a malicious
  actor from accessing them.
  ---------------------------------------------------------------------------*/

app.get('/:asset', function (req, res, next) {
    httpHeaders(res);

    res.sendFile(req.params.asset, sendFileOptions('/assets/', 60 * 60 * 1000), function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });
});







/*-----------------------------------------------------------------------------
  Set a bunch of standard HTTP headers:
  ---------------------------------------------------------------------------*/

function httpHeaders(res) {

    // Limits use of external script/css/image resources
    if (app.settings.env!='development') {
        res.header('Content-Security-Policy', "default-src 'self'; style-src 'self' fonts.googleapis.com; script-src 'self'; font-src fonts.gstatic.com");
    }

    // Don't allow this site to be embedded in a frame; helps mitigate clickjacking attacks
    res.header('X-Frame-Options', 'sameorigin');

    // Prevent MIME sniffing; instruct client to use the declared content type
    res.header('X-Content-Type-Options', 'nosniff');

    // Don't send a referrer to a linked page, to avoid transmitting sensitive information
    res.header('Referrer-Policy', 'no-referrer');

    // Limit access to local devices
    res.header('Permissions-Policy', "camera=(), display-capture=(), microphone=(), geolocation=(), usb=()"); // replaces Feature-Policy

    return;
}







/*-----------------------------------------------------------------------------
  API functions
  ---------------------------------------------------------------------------*/

async function createEvent(name, apikey, templateName) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Create_Event @Name=@name, @From_template_name=@templateName, @Sessionize_API_key=@apikey;',
            [   { "name": 'name',         "type": cannedSql.Types.NVarChar,   "value": name },
                { "name": 'templateName', "type": cannedSql.Types.NVarChar,   "value": templateName },
                { "name": 'apikey',       "type": cannedSql.Types.VarChar,    "value": apikey }],
            function(recordset) {
                var eventId=recordset.data[0].Event_ID;
                var eventSecret=recordset.data[0].Event_secret;

console.log('recordset', { "eventId": eventId, "eventSecret": eventSecret });

                resolve({ "eventId": eventId, "eventSecret": eventSecret });
            });
        });
}

async function createPresenter(name, email, identifier) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Create_Presenter @Name=@name, @Email=@email, @Identifier=@identifier;',
            [   { "name": 'name', "type": cannedSql.Types.NVarChar, "value": name },
                { "name": 'email', "type": cannedSql.Types.VarChar, "value": email },
                { "name": 'identifier', "type": cannedSql.Types.VarChar, "value": identifier }],
            async function (recordset) {
                var presenterId = recordset.data[0].Presenter_ID;
                resolve(presenterId);
            });
    });
}

async function createSession(eventId, title, sessionizeId) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Create_Session  @Event_ID=@eventId, @Title=@title, @Sessionize_id=@sessionizeId;',
            [   { "name": 'eventId', "type": cannedSql.Types.Int,      "value": eventId },
                { "name": 'title',   "type": cannedSql.Types.NVarChar, "value": title },
                { "name": 'sessionizeId', "type": cannedSql.Types.Int, "value": sessionizeId }],
            async function (recordset) {
                var sessionId = recordset.data[0].Session_ID;
                resolve(sessionId);
            });
    });
}

async function createSessionPresenter(sessionId, presenterId, isOwner) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Create_Session_Presenter  @Session_ID=@sessionId, @Presenter_ID=@presenterId, @Is_session_owner=@isOwner;',
            [   { "name": 'sessionId',   "type": cannedSql.Types.BigInt, "value": sessionId },
                { "name": 'presenterId', "type": cannedSql.Types.Int,    "value": presenterId },
                { "name": 'isOwner',     "type": cannedSql.Types.Bit,    "value": isOwner }],
            async function (recordset) {
                resolve();
            });
    });
}

async function initResponse(sessionId) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Init_Response  @Session_ID=@sessionId;',
            [   { "name": 'sessionId',   "type": cannedSql.Types.BigInt, "value": sessionId }],
            async function (recordset) {
                try {
                    var blob = JSON.parse(recordset.data[0].Question_blob);
                    resolve(blob);
                } catch(e) {
                    reject();
                }
            });
    });
}

async function saveResponse(responseId, clientKey, questionId, answerOrdinal, plaintext) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Save_Response_Answer '+
                    '@Response_ID=@responseId, @Client_key=@clientKey, @Question_ID=@questionId, '+
                    '@Answer_ordinal=@answerOrdinal, @Plaintext=@plaintext;',
            [   { "name": 'responseId',     "type": cannedSql.Types.BigInt,             "value": responseId },
                { "name": 'clientKey',      "type": cannedSql.Types.UniqueIdentifier,   "value": clientKey },
                { "name": 'questionId',     "type": cannedSql.Types.Int,                "value": questionId },
                { "name": 'answerOrdinal',  "type": cannedSql.Types.SmallInt,           "value": answerOrdinal },
                { "name": 'plaintext',      "type": cannedSql.Types.NVarChar,           "value": plaintext }],
            function(recordset) {
                resolve(recordset);
            });
        });
}

async function listSessions(responseId, clientKey) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Get_Sessions '+
                    '@Response_ID=@responseId, @Client_key=@clientKey;',
            [   { "name": 'responseId',     "type": cannedSql.Types.BigInt,             "value": responseId },
                { "name": 'clientKey',      "type": cannedSql.Types.UniqueIdentifier,   "value": clientKey }],
            function(recordset) {
                try {
                    var blob = JSON.parse(recordset.data[0].Sessions_blob);
                    resolve(blob);
                } catch(e) {
                    reject();
                }
            });
        });
}

async function listPresenterSessions(presenterId, eventId) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Get_Sessions '+
                    '@Presenter_ID=@presenterId, @Event_ID=@eventId;',
            [   { "name": 'presenterId', "type": cannedSql.Types.Int, "value": presenterId },
                { "name": 'eventId',     "type": cannedSql.Types.Int, "value": eventId }],
            function(recordset) {
                try {
                    var blob = JSON.parse(recordset.data[0].Sessions_blob);
                    resolve(blob);
                } catch(e) {
                    reject();
                }
            });
        });
}

async function listTemplates() {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Get_Templates;',
            [],
            function(recordset) {
                var blob = JSON.parse(recordset.data[0].Template_blob);
                resolve(blob);
            });
        });
}

async function adminEventInfo(eventSecret) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Admin_Event_Info @Event_secret=@eventSecret;',
            [ { "name": 'eventSecret', "type": cannedSql.Types.UniqueIdentifier, "value": eventSecret } ],
            function(recordset) {
                try {
                    var blob = JSON.parse(recordset.data[0].Event_blob);
                    resolve(blob);
                } catch(e) {
                    reject();
                }
            });
        });
}

async function getReport(eventSecret) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Get_Event_Report @Event_secret=@eventSecret;',
            [   { "name": 'eventSecret', "type": cannedSql.Types.UniqueIdentifier, "value": eventSecret }],
            function(recordset) {
                try {
                    var blob = JSON.parse(recordset.data[0].Report_blob);
                    resolve(blob);
                } catch(e) {
                    reject();
                }
            });
        });
}

