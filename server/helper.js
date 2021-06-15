require("dotenv").config();
const { HOST, SHOPIFY_API_SECRET_KEY, API_VERSION, DEBUG_MODE } = process.env;
const soap = require('soap');
const crypto = require('crypto');
const querystring = require('querystring');
const DB_URL = 'http://api-shopify.emalogic.com';

function getShopifyRequestHeaders(accessToken){
    return {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
    };
}

function orderIntegrationIsEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'enableOrderIntegration' && item.value === 'true')
}

function orderAutomaticSendIsEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'orderIntegrationAutomatic' && item.value === 'true')
}

function isPickUpsShippingMethod(shippingMethod){
    return shippingMethod.includes('Access Points UPS') || shippingMethod.includes('UPS PickUp')
}

async function getIntegrationData(shop){
    const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'isPrivate': true})
    });
    try {
        const shippingDataJson = await shippingDataResponse.json();
        return shippingDataJson.metafields.filter((item) => item.namespace === 'pickups-integration');
    } catch (e) {
        console.log('getIntegrationData Error:', e);
        return {'error': true, 'message': 'getIntegrationData Error:'+e };
    }
}

async function getOrderData(shop, orderId){
    const getOrderResponse = await fetch(`${HOST}api/get-order`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });
    if(getOrderResponse.status !== 200){
        return {'errors': `${getOrderResponse.status} - ${getOrderResponse.statusText}`}
    }
    try {
        return await getOrderResponse.json();
    } catch (e) {
        console.log('getOrderData Error: ', e);
        return {'errors': 'getOrderData Error: '+e };
    }
}

async function saveOrderNote(shop, orderId){
    const saveOrderNoteResponse = await fetch(`${HOST}api/save-order-note`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });
    if(saveOrderNoteResponse.status !== 200){
        return {'errors': `${saveOrderNoteResponse.status} - ${saveOrderNoteResponse.statusText}`}
    }
    try {
        return await saveOrderNoteResponse.json();
    } catch (e) {
        console.log('saveOrderNoteData Error: ', e);
        return {'errors': 'saveOrderNoteData Error: '+e };
    }
}

async function saveOrderPickupPoint(shop, orderId, pickupPoint){
    const saveOrderPickupPointResponse = await fetch(`${HOST}api/save-order-pickup-point`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'pickupPoint': pickupPoint})
    });

    if(saveOrderPickupPointResponse.status !== 200){
        return {'errors': `${saveOrderPickupPointResponse.status} - ${saveOrderPickupPointResponse.statusText}`}
    }
    try {
        return await saveOrderPickupPointResponse.json();
    } catch (e) {
        console.log('saveOrderPickupPointData Error: ', e);
        return {'errors': 'saveOrderPickupPointData Error: '+e };
    }
}

async function autoSendToUps(shop, orderId){
    const integrationData = await getIntegrationData(shop);

    if (!integrationData['error'] && orderIntegrationIsEnabled(integrationData) && orderAutomaticSendIsEnabled(integrationData)) {
        try {
            await fetch(`${HOST}api/send-to-ups?shop=${shop}&id=${orderId}&automatic=true`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
        } catch (e) {
            console.log(e);
        }
    }
}

async function webServiceAuthLogin(integrationData){
    const webServiceAuthUrl = integrationData.find((item) => item.key === 'webServiceAuthUrl').value;
    const webServiceUsername = integrationData.find((item) => item.key === 'webServiceUsername').value;
    const webServicePassword = integrationData.find((item) => item.key === 'webServicePassword').value;
    const webServiceLogin = {
        username: webServiceUsername,
        password: webServicePassword
    }

    try {
        const authClient = await soap.createClientAsync(webServiceAuthUrl);

        const authClientLogin = new Promise(function (resolve) {
            authClient['Login'](webServiceLogin, function (err, result) {
                resolve(result.LoginResult);
            });
        });

        const isLoggedIn = await authClientLogin;

        return {
            'isLoggedIn': isLoggedIn,
            'authClient': authClient
        }
    } catch (e) {
        console.log('webServiceAuthLogin Error: ',e);
        return {'isLoggedIn': false, 'authClient': false };
    }
}

function verifyHmac(requestQuery, hmac, isBulkAction){
    delete requestQuery['hmac'];
    let bodyString = '';

    if(isBulkAction){
        const ids = requestQuery['ids[]'];

        const idsList = Array.isArray(ids) ? ids.join('", "') : ids;

        const format = requestQuery['format'];
        if(format) {
            delete requestQuery['format'];
            bodyString += `format=${format}&`;
        }

        bodyString += `host=${requestQuery['host']}&`;
        delete requestQuery['host'];

        bodyString += `ids=["${idsList}"]&`;

        delete requestQuery['ids[]'];
    }

    bodyString += querystring.stringify(requestQuery);

    console.log('bodyString', bodyString);

    const generatedHash = crypto
        .createHmac('sha256', SHOPIFY_API_SECRET_KEY)
        .update(bodyString)
        .digest('hex')

    return generatedHash === hmac;
}

async function verifyHmacWebhook(rawBody, hmac){
    try {
        const generatedHash = crypto
            .createHmac('sha256', SHOPIFY_API_SECRET_KEY)
            .update(rawBody)
            .digest('base64');
        return generatedHash === hmac;
    } catch(e){
        console.log('rawBodyError', e);
    }

    return false;
}

async function getAccessToken(shop){
    const headers = {
        'Content-type': 'application/x-www-form-urlencoded'
    };
    const body = 'shop=' + encodeURIComponent(shop);
    return await dbConnect('get', headers, body);
}

async function insertAccessToken(shop, accessToken){
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    const body = JSON.stringify({ 'Shop': shop, 'AccessToken': accessToken, 'InstallDate': new Date().toISOString()})
    return await dbConnect('insert', headers, body);
}

async function dbConnect(type, headers, body){
    if(DEBUG_MODE === 'true'){
        console.log('dbConnect', body);
    }
    let method,
        name,
        endpoint,
        fetchOptions;
    switch (type) {
        case 'insert':
            method = 'POST';
            name = 'InsertToken';
            endpoint = DB_URL+'/api/v1/Shopify/InsertShopifyAccessToken';
            fetchOptions = {
                method: method,
                headers: headers,
                body: body
            };
            break;
        case 'get':
            method = 'GET';
            name = 'getAccessTokenStr';
            endpoint = DB_URL+'/api/v1/Shopify/GetShopifyAccessTokenStringByShop?'+body;
            fetchOptions = {
                method: method,
                headers: headers
            };
            break;
    }

    const dbConnectResponse = await fetch(endpoint, fetchOptions);

    if(name === 'InsertToken'){
        if(dbConnectResponse['Message']){
            throw new Error(dbConnectResponse['Message']);
        }
        return;
    }

    try {
        return await dbConnectResponse.json();
    } catch (e){
        throw new Error(e);
    }
}

async function sendOrderToUps(shop){
    const shippingDataResponse = await fetch(`${HOST}api/send-to-ups`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop})
    });
    try {
        const shippingDataJson = await shippingDataResponse.json();
        return shippingDataJson.metafields.filter((item) => item.namespace === 'pickups-integration');
    } catch (e) {
        console.log('sendOrderToUps Error:', e);
        return {'error': true, 'message': 'sendOrderToUps Error:'+e };
    }
}

module.exports = {
    getShopifyRequestHeaders,
    getIntegrationData,
    getOrderData,
    saveOrderNote,
    saveOrderPickupPoint,
    orderIntegrationIsEnabled,
    orderAutomaticSendIsEnabled,
    webServiceAuthLogin,
    verifyHmac,
    verifyHmacWebhook,
    getAccessToken,
    insertAccessToken,
    isPickUpsShippingMethod,
    autoSendToUps
}
