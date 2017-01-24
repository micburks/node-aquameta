'use strict';
const pg = require('pg');
const QueryOptions = require('./QueryOptions');

const anonConfig = {
    /*
    user: 'anonymous',
    password: null,
    */
    user: 'mickey',
    password: 'secret',
    database: 'aquameta',
    host: 'localhost',
    port: 5432,
    max: 4,
    idleTimeoutMillis: 30000
};

/* TODO I want to keep track of how many pools are open and when they connect
 * pg-pool has some great events
 * pool.on('connect', client => {
 *   client.count = count++
 * })
 */

/* TODO in order to do this, I would have to keep track of the open pools,
 * instead of doing it with pg.connect()

/*
var pool = new pg.Pool(config);
pool.connect(callback);
// is the same as
pg.connect(config, callback);
// and this way, pg will keep track of the pools and not create a new one when
// the same config has been passed in twice
*/

const verifySession = function( req ) {

    // TODO
    // If req.session.user is logged in, return pg.connect(userConfig) without
    // looking at endpoint.session
    // ... except that a user could have logged out since last time ...

    // TODO
    // Need to pull out session_id from cookies without using 3rd party library
    // in the case that the user hasn't installed it

/* TODO
        // Auth session
        let auth_session_id = req.cookies.sessionId;


        let currentSessionCookie =  req.cookies.sessionId;
        if (this.authSessionId != currentSessioncookie) {
            // session has changed
            // update auth_session_id
            this.authSessionId = currentSessionCookie;
            // dump cache
            this.cache = {};
        }
        */

    return pg.connect(anonConfig)
        .then(client => {
            return client.query(
                    'select (role_id).name as role_name from endpoint.session where id = $1::uuid',
                    [ req.cookies.session_id ])

                .then(result => {

                    /* TODO put session_id in the cookie data after doing lookup */

                    /* Logged in */
                    //console.log('result is : ', result.rows.length, result.rows);

                    /* Release Client */
                    client.release();

                    /* Copy anonymous config and modify user */
                    let userConfig = Object.assign({}, anonConfig, { user: result.rows[0].role_name });
                    console.log('configs', userConfig, anonConfig);

                    return pg.connect(userConfig);
                })
                .catch(err => {
                    /* Problem logging in */
                    //console.log('connection error is : ', err);

                    // TODO is there any need to connect again? just return the client
                    /* Release Client */
                    /*
                    client.release();
                    return pg.connect(anonConfig);
                    */
                    return client;
                });

        });

}


module.exports = function( request, config ) {

    const query = function( method ) {

        return function( metaId, args, data ) {

            /* TODO?
            let query = new Query(method, metaId, args, data);
            return query.run(verifySession(request));
            */
            
            args = args || {};
            data = data || {};
            let queryOptions = new QueryOptions(args);

            return verifySession(request)
            .then(client => {

                console.log('trying connection', config.version, method, metaId.toUrl(), JSON.stringify(queryOptions.options), JSON.stringify(data));

                return client.query(
                    'select status, message, response, mimetype ' +
                    'from endpoint.request($1, $2, $3, $4::json, $5::json)', [
                        config.version,
                        method,
                        metaId.toUrl(),
                        JSON.stringify(queryOptions.options),
                        JSON.stringify(data)
                ])
                .then(result => {
                    client.release();
                    result = result.rows[0];
                    if (result.status >= 400) {
                        throw result;
                    }
                    console.log('endpoint.request, result.rows:', result);
                    return result.response;
                })
                .catch(err => {
                    if (client.release) client.release();
                    console.log('error in endpoint.request query', err);
                });

            });
        };
    };

    // TODO Big ol' ugly ternary
    return request ? {
        get: query('GET'),
        post: query('POST'),
        patch: query('PATCH'),
        delete: query('DELETE')
    } :
    { connect: verifySesson };

};

