#!/usr/bin/env node



// Core modules:
const fs = require('fs');
const path = require('path');
const https = require('https');

// Canned SQL query interface:
const cannedSql=require('./canned-sql.js');

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
               appName        : 'review.datasatsto.se' // host name of the web server
        }
    };




/*-----------------------------------------------------------------------------
  Start the web server
-----------------------------------------------------------------------------*/

console.log('HTTP port:       '+serverPort);
console.log('Database server: '+process.env.dbserver);
console.log('Express env:     '+app.settings.env);
console.log('');

app.listen(serverPort, () => console.log('READY.'));






















/*-----------------------------------------------------------------------------
  Default URL: returns a 404
  ---------------------------------------------------------------------------*/

app.get('/', function (req, res, next) {

    httpHeaders(res);

    var options = {
        root: __dirname + '/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.status(404).sendFile('error.html', options, function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });

    return;

});


/*-----------------------------------------------------------------------------
  List sessions
  ---------------------------------------------------------------------------*/

app.get('/sessions', function(req, res, next) {
    httpHeaders(res);

    var options = {
        root: __dirname + '/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.status(200).sendFile('template.html', options, function(err) {
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

    res.status(200).send(await listSessions(responseId, clientKey));
});


/*-----------------------------------------------------------------------------
  Review a new session
  ---------------------------------------------------------------------------*/

app.get('/:sessionid([0-9]*)', function (req, res, next) {
    httpHeaders(res);

    var options = {
        root: __dirname + '/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.status(200).sendFile('template.html', options, function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });

    return;
});

app.get('/api/create-response/:sessionid', async function (req, res, next) {
    httpHeaders(res);
    res.status(200).send(await initResponse(req.params.sessionid));
});




/*-----------------------------------------------------------------------------
  Get session from a Sessionize event

  TODO: Error handling
  TODO: Parameter for how long a session accepts responses
  ---------------------------------------------------------------------------*/

app.get('/api/add-from-sessionize/:apikey', async function (req, res, next) {

    // TODO: Hard-coded for now
    const templateName='Data Saturday template';

    var sessions=await getSessionizeJSON(req.params.apikey);

    var eventId=await createEvent('Event name goes here', req.params.apikey, templateName);

    for (const session of sessions) {

        // Regular session and status accepted?
        if (session.status=='Accepted' && !session.isServiceSession) {

            var presenters=[];
            for (const presenter of session.speakers) {
                presenters.push(await createPresenter(presenter.name, null, presenter.id));
            }

            var sessionId=await createSession(eventId, session.title, session.id);

            var isOwner=true;
            for (const presenterId of presenters) {
                await createSessionPresenter(sessionId, presenterId, isOwner);
                isOwner=false;
            }

        }
    }

    res.status(200).send({ status : "ok" });
    //console.log(sessions);

});



async function getSessionizeJSON(apikey) {

    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET' /*,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' } */
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
  Write a response
  ---------------------------------------------------------------------------*/

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
  Other related assets, like CSS or other files:
  ---------------------------------------------------------------------------*/

app.get('/:asset', function (req, res, next) {

    httpHeaders(res);

    var options = {
        maxAge: 60 * 60 * 1000,         // Max age 1 hour (so we can cache stylesheets, etc)
        root: __dirname + '/assets/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.sendFile(req.params.asset, options, function(err) {
        if (err) {
            res.sendStatus(404);
            return;
        }
    });
});









function simpleHtmlEncode(plaintext) {
    var html=plaintext;
    html=html.replace('&', '&amp;');
    html=html.replace('<', '&lt;');
    html=html.replace('>', '&gt;');
    return(html);
}




/*-----------------------------------------------------------------------------
  Set a bunch of standard HTTP headers:
  ---------------------------------------------------------------------------*/

function httpHeaders(res) {
/*
    // The "preload" directive also enables the site to be pinned (HSTS with Preload)
    const hstsPreloadHeader = 'max-age=31536000; includeSubDomains; preload'
    res.header('Strict-Transport-Security', hstsPreloadHeader); // HTTP Strict Transport Security with preload
*/
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
                resolve(eventId);
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
                console.log(name, 'return(' + presenterId + ')');
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
                var blob = JSON.parse(recordset.data[0].Question_blob);
                resolve(blob);
            });
    });
}

async function saveResponse(responseId, clientKey, questionId, answerOrdinal, plaintext) {

    return new Promise((resolve, reject) => {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE Feedback.Save_Response_Answer '+
                    '@Response_ID=@responseId, @Client_key=@clientKey, @Question_ID=@questionId, '+
                    '@Answer_ordinal=@answerOrdinal, @Plaintext=@plaintext;',
            [   { "name": 'responseId',     "type": cannedSql.Types.Int,                "value": responseId },
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
            [   { "name": 'responseId',     "type": cannedSql.Types.Int,                "value": responseId },
                { "name": 'clientKey',      "type": cannedSql.Types.UniqueIdentifier,   "value": clientKey }],
            function(recordset) {
                var blob = JSON.parse(recordset.data[0].Sessions_blob);
                resolve(blob);
            });
        });
}
