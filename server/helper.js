require("dotenv").config();
const { ENV, HOST, SHOPIFY_API_SECRET_KEY, WHITELIST_IPS, API_VERSION, DEBUG_MODE, SEQ_URL, DB_URL } = process.env;
const crypto = require('crypto');
const querystring = require('querystring');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

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

function isGetWaybillStatusEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'enableGetWaybillStatus' && item.value === 'true')
}

function orderAutomaticSendIsEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'orderIntegrationAutomatic' && item.value === 'true')
}

function orderClosestPointsWhileSendToUpsIsEnabled(integrationData){
    return !!integrationData.find((item) => item.key === 'orderIntegrationClosestPoints' && item.value === 'true')
}

function isPickUpsShippingMethod(shippingMethod){
    return shippingMethod.includes('Access Points UPS') || shippingMethod.includes('UPS PickUp') || shippingMethod.includes('pickups_')
}

function getAllowedShippingMethods(integrationData){
    try {
        const shippingMethods = getFieldFromIntegrationData(integrationData, 'shippingMethodSelected')
        return shippingMethods.split(',');
    } catch(e){
        return [];
    }
}

function isShippingMethodAllowCreateWaybill(shippingMethod, integrationData){
    try {
        if(isPickUpsShippingMethod(shippingMethod)){
            return true;
        }
        if(getFieldFromIntegrationData(integrationData, 'enableShippingMethodSelect') !== 'true'){
            return true;
        }
        const allowedMethods = getAllowedShippingMethods(integrationData);
        return allowedMethods.includes(shippingMethod);
    } catch(e){
        return true;
    }
}

async function getShippingData(shop, accessToken, checkAuth = false){
    const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'isPrivate': true, 'checkAuthInformation': checkAuth})
    });

    try {
        if(shippingDataResponse.status !== 200){
            throw new Error(`${shippingDataResponse.status} - ${shippingDataResponse.statusText}`);
        }

        return await shippingDataResponse.json();
    } catch (e) {
        console.log(getDate()+' getShippingData Error:', e);
        return {'error': true, 'message': 'getShippingData Error:'+e, 'statusMessage': e.message };
    }
}

async function saveOrderTag(shop, accessToken, orderId, orderTags, message, removeTagPrefix = null){
    console.log('orderTags', orderTags)
    if(orderTags.includes(message)){
        return orderTags;
    }
    const response = await fetch(`${HOST}api/save-order-tags-error`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'orderId': orderId, 'orderError': message, 'orderTags': orderTags, 'removeTagPrefix': removeTagPrefix})
    });

    const responseJson = await response.json();

    console.log('responseJson', responseJson);

    return responseJson.orderTags;
}

async function saveOrderTagError(shop, accessToken, orderId, orderTags, error){
    if(orderTags.includes(error)){
        return true;
    }
    const response = await fetch(`${HOST}api/save-order-tags-error`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'orderId': orderId, 'orderError': `UPS Error: ${error}`, 'orderTags': orderTags})
    });

    return await response.json();
}

async function getProductData(shop, accessToken, productId){
    const productDataResponse = await fetch(`${HOST}api/get-product-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'productId': productId})
    });

    try {
        return await productDataResponse.json();
    } catch (e) {
        console.log(getDate()+' getProductData Error:', e);
        return {'error': true, 'message': 'getProductData Error:'+e };
    }
}

async function getIntegrationData(shop, accessToken){
    try {
        const shippingDataJson = await getShippingData(shop, accessToken);
        if(shippingDataJson['error']){
            throw new Error(shippingDataJson['statusMessage'])
        }
        return shippingDataJson.metafields.filter((item) => item.namespace === 'pickups-integration');
    } catch (e) {
        console.log(getDate()+' getIntegrationData Error:', e);
        return {'error': true, 'message': 'getIntegrationData Error:'+e.message };
    }
}

async function getOrderData(shop, accessToken, orderId){
    const getOrderResponse = await fetch(`${HOST}api/get-order`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId, 'accessToken': accessToken })
    });
    if(getOrderResponse.status !== 200){
        return {'errors': `${getOrderResponse.status} - ${getOrderResponse.statusText}`}
    }
    try {
        return await getOrderResponse.json();
    } catch (e) {
        console.log(getDate()+' getOrderData Error: ', e);
        return {'errors': 'getOrderData Error: '+e };
    }
}

async function saveOrderNote(shop, accessToken, orderId){
    const saveOrderNoteResponse = await fetch(`${HOST}api/save-order-note`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'accessToken': accessToken, 'orderId': orderId })
    });
    if(saveOrderNoteResponse.status !== 200){
        return {'errors': `${saveOrderNoteResponse.status} - ${saveOrderNoteResponse.statusText}`}
    }
    try {
        return await saveOrderNoteResponse.json();
    } catch (e) {
        console.log(getDate()+' saveOrderNoteData Error: ', e);
        return {'errors': 'saveOrderNoteData Error: '+e };
    }
}

async function saveOrderPickupPoint(shop, accessToken, orderId, pickupPoint, orderData = false, autoSend = false){

    const saveOrderPickupPointResponse = await fetch(`${HOST}api/save-order-pickup-point`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'orderId': orderId, 'pickupPoint': pickupPoint, 'autoSend': autoSend, 'orderData': orderData})
    });

    if(saveOrderPickupPointResponse.status !== 200){
        return {'errors': `${saveOrderPickupPointResponse.status} - ${saveOrderPickupPointResponse.statusText}`}
    }
    try {
        await saveOrderPickupPointResponse.json();
    } catch (e) {
        console.log(getDate()+' saveOrderPickupPointData Error: ', e);
        return {'errors': 'saveOrderPickupPointData Error: '+e };
    }
}

async function autoSendToUps(shop, accessToken, orderId){
    const integrationData = await getIntegrationData(shop, accessToken);

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

function getApiUrl(apiEnv, type){
    if(apiEnv === 'test'){
        if(type === 'upsApiCreateUrl'){
            return 'https://testplugins.ship.co.il/';
        }

        if(type === 'upsApiUrl'){
            return 'https://newbetaapi.ship.co.il/';
        }
    }

    if(type === 'upsApiCreateUrl'){
        return 'https://plugins.ship.co.il/';
    }

    if(type === 'upsApiUrl'){
        return 'https://api.ship.co.il/';
    }
}

function getApiEnv(integrationData){
    try {
        return integrationData.find((item) => item.key === 'upsIntegrationApiEnv').value;
    } catch (e){
        return undefined;
    }
}

function getFieldFromIntegrationData(integrationData, fieldKey){
    try {
        if(fieldKey === 'upsApiCreateUrl' || fieldKey === 'upsApiUrl'){
            const apiEnv = getApiEnv(integrationData);
            return getApiUrl(apiEnv, fieldKey);
        }
        return integrationData.find((item) => item.key === fieldKey).value;
    } catch (e){
        return undefined;
    }
}

async function getRestApiAccessToken(integrationData, type){
    const apiType = type === 'create' ? 'upsApiCreateUrl' : 'upsApiUrl';
    let apiHost = getFieldFromIntegrationData(integrationData,apiType);

    if(!apiHost || apiHost === 'X'){
        if(type === 'create'){
            apiHost = 'https://plugins.ship.co.il/';
        }else {
            return {
                'errors': 'REST Create Api URL is empty'
            }
        }
    }

    const apiUrl = apiHost + 'Token';
    const apiUsername = getFieldFromIntegrationData(integrationData,'upsIntegrationUsername');
    const apiPassword = getFieldFromIntegrationData(integrationData,'upsIntegrationPassword');
    const apiScope = getFieldFromIntegrationData(integrationData,'upsIntegrationScope');

    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

    const urlencoded = new URLSearchParams();
    urlencoded.append("username", apiUsername);
    urlencoded.append("password", apiPassword);
    urlencoded.append("scope", apiScope);
    urlencoded.append("grant_type", "password");

    const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: urlencoded,
        redirect: 'follow'
    };

    try {
        const response = await fetch(apiUrl, requestOptions);
        const data = await getResponseJsonAndSaveLogs('getRestApiAccessToken', '', apiUrl, requestOptions, response);

        if(data['error']){
            throw data['error'] +' - '+data['error_description'];
        }

        const apiAccessToken = data['access_token'];

        return {
            'isLoggedIn': !!apiAccessToken,
            'apiAccessToken': apiAccessToken
        }
    } catch (e) {
        console.log(getDate()+' getRestApiAccessToken Error: ',e);
        return {'isLoggedIn': false, 'apiAccessToken': false };
    }
}

async function getCustomerTypeApi(integrationData){
    const {isLoggedIn, apiAccessToken} = await getRestApiAccessToken(integrationData, 'create');
    if (!isLoggedIn) {
        return { 'errors': 'Auth Error' }
    }

    const apiUrl = getFieldFromIntegrationData(integrationData,'upsApiCreateUrl') + 'api/v1/easyship/is-credit-customer';

    const requestOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiAccessToken
        }
    };

    try {
        const response = await fetch(apiUrl, requestOptions);
        const data = await getResponseJsonAndSaveLogs('getCustomerTypeApi', '', apiUrl, requestOptions, response, 'text');

        if(!data){
            throw 'Api Return Empty Response';
        }

        const dataJson = JSON.parse(data);

        if(dataJson['Message']){
            throw dataJson['Message'] || dataJson['Result']['ErrorMessage'];
        }

        const customerType = dataJson['IsCreditDomestic'] === true ? 'אשראי' : 'מזומן';
        const isCreditExport = dataJson['IsCreditExport'] === true;
        return { 'response': customerType, 'isCreditExport': isCreditExport };

    } catch (e) {
        console.log(getDate()+' getCustomerTypeApi Error: ',e);
        return { 'errors': e }
    }
}

async function restApiPrintLabel(accessToken, apiAccessToken, integrationData, wayBillNumber, format){
    const apiUrl = getFieldFromIntegrationData(integrationData,'upsApiUrl') + 'api/v1/shipments/PrintWBOrderDetails';
    const functionArgs = {
        'trackingNumbers': wayBillNumber,
        'isA4Format': format === 'A4' ? 'True' : 'False',
        'printPickingList': 'false'
    };

    const urlParams = new URLSearchParams(functionArgs);

    const requestOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiAccessToken
        }
    };

    try {
        const response = await fetch(apiUrl +'?'+ urlParams, requestOptions);
        const data = await getResponseJsonAndSaveLogs('restApiPrintLabel', '', apiUrl, requestOptions, response, 'text');

        if(!data){
            throw 'Api Return Empty Response';
        }

        if(data['Message']){
            throw data['Message'] || data['Result']['ErrorMessage'];
        }

        return { 'response': data };

    } catch (e) {
        console.log(getDate()+' restApiPrintLabel Error: ',e);
        return { 'errors': e }
    }
}

async function getOrderAdditionalInfo(shop, accessToken, orderId){
    const getOrderMetafieldsResponse = await fetch(`${HOST}api/get-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'accessToken': accessToken, 'orderId': orderId })
    });

    const getOrderMetafieldsJson = await getOrderMetafieldsResponse.json();

    let orderIsDDO = '';
    let orderCODDetails = '';
    let orderCODValue = '';
    let orderIsUDR = '';
    let orderIsReturn = '';
    let orderNumOfPackages = '';
    getOrderMetafieldsJson.metafields.forEach((item) => {
        if(item.key === 'pickups_is_ddo'){
            orderIsDDO = item.value;
        }
        if(item.key === 'pickups_cod_details'){
            orderCODDetails = item.value
        }
        if(item.key === 'pickups_cod_value'){
            orderCODValue = item.value
        }
        if(item.key === 'pickups_is_udr'){
            orderIsUDR = item.value
        }
        if(item.key === 'pickups_is_return'){
            orderIsReturn = item.value
        }
        if(item.key === 'pickups_num_of_packages'){
            orderNumOfPackages = item.value
        }
    })

    return { 'orderIsDDO': orderIsDDO, 'orderCODDetails': orderCODDetails, 'orderCODValue': orderCODValue, 'orderIsUDR': orderIsUDR, 'orderIsReturn': orderIsReturn, 'orderNumOfPackages': orderNumOfPackages};
}

async function mergePdf(pdfList, format){
    let pdfFinal,
        pdfEncodingType;
    if (pdfList.length > 1) {
        const mergedPdf = await PDFDocument.create();
        for (const item of pdfList) {
            const itemBuffer = Buffer.from(item, 'base64');
            const pdfBytes = new Uint8Array(itemBuffer);
            const pdf = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => {
                mergedPdf.addPage(page);
            });
        }

        pdfFinal = await mergedPdf.save();
        pdfEncodingType = 'uint8';
    } else {
        pdfFinal = pdfList[0];
        pdfEncodingType = 'base64';
    }

    const pdfFile = Buffer.from(pdfFinal, pdfEncodingType);

    const pdfDir = 'ups-labels';

    let serverPdfDir = `./public/${pdfDir}`;
    /*
    if (ENV === 'production' || ENV === 'staging') {
        serverPdfDir = '/mnt/ups-labels';
    }*/

    const uniqueId = Date.now() * 123
    const pdfFilename = `ups_${format.toLowerCase()}_${uniqueId}.pdf`;

    if (!fs.existsSync(serverPdfDir)){
        fs.mkdirSync(serverPdfDir);
    }

    fs.writeFileSync(`${serverPdfDir}/${pdfFilename}`, pdfFile,'binary');

    return {
        'output': 'Your Label will be open in a few seconds...',
        'pdfDownloadFile': `${HOST}${pdfDir}/${pdfFilename}`
    }
}

function verifyHmac(requestQuery, hmac, isBulkAction){
    delete requestQuery['hmac'];
    let bodyString = '';

    if(isBulkAction){
        return true;
        const ids = requestQuery['ids[]'];

        const idsList = Array.isArray(ids) ? ids.join('", "') : ids;

        bodyString += `ids=["${idsList}"]&`;

        delete requestQuery['ids[]'];
    }

    bodyString += querystring.stringify(requestQuery);

    const generatedHash = crypto
        .createHmac('sha256', SHOPIFY_API_SECRET_KEY)
        .update(bodyString)
        .digest('hex')

    return generatedHash === hmac;
}

function isIpWhitelist(ip){
    const whitelist = WHITELIST_IPS
        ? WHITELIST_IPS.split(',').map(ip => ip.trim())
        : [];
    console.log('whitelist', whitelist)
    return !whitelist.includes(ip);
}

async function createHmacWebhook(rawBody){
    try {
        const hmac = await crypto
            .createHmac('sha256', SHOPIFY_API_SECRET_KEY)
            .update(rawBody)
            .digest('base64');

        return hmac;
    } catch(e){
        console.log(getDate()+' createHmacWebhook error', e);
    }

    return false;
}

async function verifyHmacWebhook(rawBody, hmac){
    try {
        const generatedHash = crypto
            .createHmac('sha256', SHOPIFY_API_SECRET_KEY)
            .update(rawBody)
            .digest('base64');

        /*

        check this for webhook task, also change .update(rawBody) to .update(rawBody, 'utf8')
        crypto.timingSafeEqual(
            Buffer.from(hmacHeader || '', 'utf8'),
            Buffer.from(generatedHmac, 'utf8')
          );
         */
        return generatedHash === hmac;
    } catch(e){
        console.log(getDate()+' rawBodyError', e);
    }

    return false;
}

async function getAccessToken(shop){
    const headers = {
        'Content-type': 'application/x-www-form-urlencoded'
    };
    const body = 'shop=' + encodeURIComponent(shop);
    const accessToken = await dbConnect('get', headers, body);
    console.log('getAccessToken', accessToken);
    return accessToken;
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

    const requestOptions = {
        'method': method,
        'name': name,
        'endpoint': endpoint,
        'fetchOptions': fetchOptions
    }

    const dbConnectResponse = await fetch(endpoint, fetchOptions);

    if(name === 'InsertToken'){
        if(dbConnectResponse['Message']){
            throw new Error(dbConnectResponse['Message']);
        }
        return;
    }

    try {
        return await getResponseJsonAndSaveLogs('dbConnect', '', endpoint, requestOptions, dbConnectResponse);
    } catch (e){
        throw new Error(e);
    }
}

async function sendOrderToUps(shop){
    const apiUrl = `${HOST}api/send-to-ups`;
    const shippingDataResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop})
    });
    try {
        const shippingDataJson = await getResponseJsonAndSaveLogs('sendOrderToUps', shop, apiUrl, {'shop': shop}, shippingDataResponse);
        return shippingDataJson.metafields.filter((item) => item.namespace === 'pickups-integration');
    } catch (e) {
        console.log(getDate()+' sendOrderToUps Error:', e);
        return {'error': true, 'message': 'sendOrderToUps Error:'+e };
    }
}

async function saveOrderWeight(shop, accessToken, orderId, orderWeight){
    const response = await fetch(`${HOST}api/save-order-weight`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'orderId': orderId, 'orderWeight': orderWeight})
    });

    return await response.json();
}

async function saveWayBillNumberOnOrder(shop, accessToken, orderId, wayBillNumber, orderTags, orderWeight, additionalTags = null){
    const response = await fetch(`${HOST}api/save-order-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'orderId': orderId, 'wayBillNumber': wayBillNumber, 'orderTags': orderTags, 'orderWeight': orderWeight, 'additionalTags': additionalTags})
    });

    return await response.json();
}

async function fullfillOrderItems(shop, accessToken, orderId, wayBillNumber, customerNotify){
    const response = await fetch(`${HOST}api/fullfill-order-items`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'orderId': orderId, 'wayBillNumber': wayBillNumber, 'customerNotify': customerNotify})
    });

    return await response.json();
}

async function saveLeadIdOnOrder(shop, accessToken, orderId, leadId, orderTags, orderWeight){
    const response = await fetch(`${HOST}api/save-order-leadid`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'orderId': orderId, 'leadId': leadId, 'orderTags': orderTags})
    });

    return await response.json();
}

async function updatedMetafields(shop, accessToken){
    await fetch(`${HOST}api/set-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'accessToken': accessToken })
    });
}

async function getClosestPoints(shop, shippingData, customerShippingAddress, pointsNumber = null){
    const shippingDataFields = shippingData.metafields;
    const integrationData = shippingDataFields.filter((item) => item.namespace === 'pickups-integration');
    const apiHost = getFieldFromIntegrationData(integrationData,'upsApiUrl');
    const apiUrl = apiHost + 'api/v1/pickups/getclosestpoints';

    const {isLoggedIn, apiAccessToken} = await getRestApiAccessToken(integrationData, 'print');
    if (!isLoggedIn) {
        return { 'errors': 'Auth Error' }
    }

    let pointTypes = shippingDataFields.find((item) => item.key === 'upsPickupsType').value;
    switch(pointTypes){
        case 'stores':
            pointTypes = 1;
            break;
        case 'lockers':
            pointTypes = 2;
            break;
        case 'all':
            pointTypes = 3;
            break;
    }
    const closestPointsAccuracy = shippingDataFields.find((item) => item.key === 'closestPointsAccuracy').value;
    const points = pointsNumber !== null ? pointsNumber : shippingDataFields.find((item) => item.key === 'closestPointsNumber').value;

    let functionArgs = {
        'city': customerShippingAddress.city || '',
        'street': customerShippingAddress.address1,
        'houseNumber': '',
        'pointTypes': pointTypes,
        'points': points
    }

    const params = new URLSearchParams(functionArgs).toString();

    try {
        const getClosestPointsResponse = await fetch(apiUrl+'?'+params, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiAccessToken
            }
        });
        const data = await getClosestPointsResponse.json();

        if(!data){
            throw 'Api Return Empty Response';
        }

        if(data['IsSuccessful'] !== true){
            console.log('getClosestPoints Request Params', functionArgs);
            console.log('getClosestPoints Error', data);
            throw data['ErrorMSG'] || 'Unknown Error';
        }

        const accuracyCodes = getAccuracyCode(closestPointsAccuracy);
        if(!accuracyCodes.includes(data['ResponseCode'])){
            throw 'Pickup points not found';
        }

        return { 'response': data['Points'], 'accuracy': {'value': closestPointsAccuracy, 'label': getAccuracyLabel(closestPointsAccuracy)} };

    } catch (e) {
        console.log(getDate()+' getClosestPoints Error: ',e);
        return { 'errors': e }
    }
}

function getAccuracyCode(type){
    const accuracyCodes = [];

    // exact
    accuracyCodes.push('100');
    accuracyCodes.push('200');
    accuracyCodes.push('300');
    accuracyCodes.push('400');

    if(type !== 'exact') {
        accuracyCodes.push('120');
        accuracyCodes.push('125');
        accuracyCodes.push('220');
    }

    if(type === 'city') {
        accuracyCodes.push('840');
    }

    return accuracyCodes;
}

function getAccuracyLabel(type){
    switch(type){
        case 'exact':
            return 'מדוייק';
        case 'city':
            return 'עד מרכז העיר';
        case 'street':
            return 'עד מרכז רחוב';
    }
}

function getAccuracyCodeLabel(code){
    switch(code){
        case '100':
        case '200':
        case '300':
        case '400':
            return 'מדוייק';
        case '120':
        case '125':
        case '220':
            return 'עד מרכז רחוב';
        case '840':
            return 'עד מרכז העיר';
        default:
            return code;
    }
}

async function getResponseJsonAndSaveLogs(route, shop, apiUrl, request, response, type = ''){
    try {

        if(route === 'dbConnect' && DEBUG_MODE === 'true'){
            console.log(getDate()+' INFO '+route+' SHOP: '+shop+' | API URL: '+apiUrl);
            console.log(getDate()+' REQUEST '+route ,request);
        }

        const responseStatus = response.status;
        if(responseStatus === 200 || responseStatus === 201) {
            if(type === 'text'){
                return await response.text();
            }
            const responseJson = await response.json();

            if(route === 'dbConnect' && DEBUG_MODE === 'true'){
                console.log(getDate()+' RESPONSE '+route ,responseJson);
            }

            return responseJson;
        }else{
            const responseText = await response.text();
            throw Error(getDate()+' ERROR '+route+' Response Error Code: '+responseStatus+', ErrorText: '+response.statusText+', response:'+responseText)
        }
    } catch (e) {
        if(DEBUG_MODE === 'true'){
            console.log(getDate()+' INFO '+route+' SHOP: '+shop+' | API URL: '+apiUrl);
            await writeLogToSeq(getDate(), ' INFO '+route+' SHOP: '+shop+' | API URL: '+apiUrl);
            console.log(getDate()+' REQUEST '+route ,request);
            await writeLogToSeq(getDate(), ' REQUEST '+route ,request);
        }
        console.log(getDate()+' ERROR '+route ,e);
        await writeLogToSeq(getDate(), ' ERROR '+route ,e);

        throw Error(e);
    }
}

async function getMetafieldsCount(shop, requestOptions){
    try {
        const apiUrl = `https://${shop}/admin/api/${API_VERSION}/metafields/count.json`;
        const metafieldsResponse = await fetch(apiUrl, requestOptions);
        const metafieldsDataJson = await getResponseJsonAndSaveLogs('get-shipping-data metafields', shop, apiUrl, requestOptions, metafieldsResponse);

        return metafieldsDataJson.count;
    } catch (e){
        console.log(getDate()+' ERROR getMetafieldsCount ',e);
        return 0;
    }
}

async function writeLogToSeq(message){
    try {
        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        const datetime = new Date().toISOString();
        const rawBody = JSON.stringify({"@t":datetime,"@mt":message});
        
        const requestOptions = {
            method: 'POST',
            headers: myHeaders,
            body: rawBody,
            redirect: 'follow'
        };

        const response = await fetch(SEQ_URL, requestOptions);
        await response.json();

        return true;

    } catch (e){
        console.log(getDate()+' ERROR writeLogToSeq ',e);
    }

    return false;
}

async function getOrderPickupsData(shop, accessToken, orderId){
    const getWaybillNumberResponse = await fetch(`${HOST}api/get-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId, 'accessToken': accessToken })
    });

    const getWaybillNumberJson = await getWaybillNumberResponse.json();

    let orderSentToUps = false;
    let orderPickupPoint = '';
    let orderLeadId = '';
    let orderWeight = '';
    let orderWaybillNumber = '';
    getWaybillNumberJson.metafields.forEach((item) => {
        if(item.key === 'pickups_point_wb'){
            orderWaybillNumber = item.value
            orderSentToUps = true;
        }
        if(item.key === 'pickups_point_lead_id'){
            orderLeadId = item.value
        }
        if(item.key === 'pickups_point_json'){
            orderPickupPoint = JSON.parse(item.value)
        }
        if(item.key === 'pickups_point_order_weight'){
            orderWeight = item.value
        }
    })

    return { 'orderSentToUps': orderSentToUps, 'orderPickupPoint': orderPickupPoint, 'orderLeadId': orderLeadId, 'orderWeight': orderWeight, 'orderWaybillNumber': orderWaybillNumber};
}

function getOrderWeight(integrationData, orderItems){
    const defaultWeight = 1;

    const orderWeightType = getFieldFromIntegrationData(integrationData,'upsIntegrationOrderWeight');
    if(orderWeightType === 'fixed_value'){
        const itemsTotalWeight = getFieldFromIntegrationData(integrationData,'upsIntegrationOrderWeightValue');
        if(itemsTotalWeight > 0){
            return itemsTotalWeight;
        }
        return defaultWeight;
    }

    let itemsTotalWeight = orderItems.reduce( ( sum, { grams, quantity } ) => sum + (grams * quantity) , 0);

    if(itemsTotalWeight > 0){
        return itemsTotalWeight/1000;
    }
    return defaultWeight;
}

function timePad(number) {
    if ( number < 10 ) {
        return '0' + number;
    }
    return number;
}

function getDate(){
    const date = new Date();
    return '['+timePad(date.getFullYear()) + '-' + timePad(date.getMonth()+1) + '-' + timePad(date.getDate()) + ' ' + timePad(date.getHours()) + ':' + timePad(date.getMinutes()) + ':' + timePad(date.getSeconds())+']';
}

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function getPickupPoint(data){
    const pickupPoint = data.orderPickupPoint;
    let id = null;
    let title = null;

    if(pickupPoint !== null){
        id = pickupPoint.iid;
        title = pickupPoint.title;
    }

    return {
        'id': id,
        'title': title
    }
}

function getReference2Field(reference2Type, order, orderPickupsData, shippingData = null){
    const pickupPoint = getPickupPoint(orderPickupsData);
    const pickupPointId = pickupPoint['id'];
    const pickupPointTitle = pickupPoint['title'];

    let serviceName;
    if(shippingData) {
        const shippingDataFields = shippingData.metafields;
        serviceName = shippingDataFields.find((item) => item.key === 'closestPointsTitle').value;
    }

    let reference2Value = '';
    switch(reference2Type){
        case 'order_id':
            reference2Value = order.name.replace('#', '') || '';
            break;
        case 'customer_name':
            reference2Value = getOrderCustomerName(order) || '';
            break;
        case 'email':
            reference2Value = order.email || '';
            break;
        case 'phone_number':
            reference2Value = validatePhoneNumber(getOrderPhoneNumber(order), isExportOrder(order)) || '';
            break;
        case 'pickup_point_id':
            reference2Value = pickupPointId || '';
            break;
        case 'pickup_point_name':
            reference2Value = pickupPointTitle ? pickupPointTitle.replace(serviceName+' - ', '') : '';
            break;
        default:
            reference2Value = '';
            break;
    }

    return reference2Value.slice(0, 30);
}

function validatePhoneNumber(phoneNumber, isExportOrderCondition){
    try {
        if(isExportOrderCondition){
            return phoneNumber.replace(/\D+/g, '');
        }
        const validNumber = phoneNumber.replace(' ', '').replace('+972', '0').replace(/-/g, '').match(/^0(5[^7])[0-9]{7}$/);
        if(validNumber === null) return false;
        return validNumber[0];
    } catch (e){
        return phoneNumber;
    }
}

async function sleep(time = 1000){
    return await new Promise(resolve => setTimeout(resolve, time));
}

function getOrderCustomerName(order){
    return `${order.shipping_address.first_name} ${order.shipping_address.last_name}`;
}

function getOrderPhoneNumber(order){
    return order.shipping_address.phone;
}

function getNumberOfPackages(additionalInformation, customerType){
    const numOfPackages = customerType !== 'אשראי' ? 1 : Number(additionalInformation['orderNumOfPackages']);
    if(numOfPackages > 99){
        return 99;
    }
    return numOfPackages || 1;
}

function isFulfillOrderItemsEnabled(integrationData){
    return getFieldFromIntegrationData(integrationData,'fulfillOrderItems') === 'true';
}

function isFulfillOrderItemsCustomerNotify(integrationData){
    return getFieldFromIntegrationData(integrationData,'fulfillOrderItemsNotify') === 'true';
}

function isInternationalExportEnable(integrationData){
    return getFieldFromIntegrationData(integrationData,'internationalExportEnable') === 'true';
}

function isExportOrder(order){
    return order.shipping_address.country_code !== 'IL';
}

function isValidExportOrder(order, integrationData, shippingData){
    return !!(isExportOrder(order) && isInternationalExportEnable(integrationData) && shippingData['isCreditExport']);
}

function getPackageForExportOrder(data){
    const numPackages = data['NumberOfPackages'];
    const packages = [];

    for (let i = 0; i < numPackages; i++) {
        packages.push({
            Weight: data['Weight'],
            Height: null,
            Width:  null,
            Length: null,
            Description: null,
            Quantity: 1,
            Ref1: String(data['Reference1'] || ''),
            Ref2: String(data['Reference2'] || '')
        });
    }

    return packages;
}

function getInvoiceItemsForExportOrderShopify(order) {
    const invoiceItems = [];
    // Shopify uses "presentment_currency" for the currency displayed to the customer/shop
    const currency = order.presentment_currency || order.currency;
    let invoiceItemsValue = 0.0;

    // Iterate over each item in the 'line_items' array (Shopify equivalent of $order->get_items())
    if (order.line_items && Array.isArray(order.line_items)) {
        order.line_items.forEach(item => {

            // In Shopify, item data (like name, price, quantity) is inline within the line_item object
            const productName = item.name;
            // The 'title' field often serves as a good product description/name as well
            const productDescription = item.title;
            const quantity = item.quantity;

            // In Shopify REST API, 'price' is the unit price for that item line (after discounts on the item level)
            // We use the item 'price' field to get the correct value for each line item.
            const unitValue = parseFloat(item.price);

            if (isNaN(unitValue)) {
                console.warn(`Skipping item ${productName} due to invalid price: ${item.price}`);
                return; // Continue to next iteration in the loop
            }

            // Calculate the subtotal for this specific line item
            const itemSubtotal = unitValue * quantity;
            invoiceItemsValue += itemSubtotal;

            invoiceItems.push({
                'Name': productName,
                'Description': productDescription,
                'Quantity': quantity,
                'Unit': 'EA', // Defaulting to 'Each'
                'UnitValue': unitValue,
                'UnitValueCurrency': currency,
                'OriginCountry': 'IL', // Defaulting to Israel as in original code
                'CustomsCode': null,
                'ShipmentLeadId': null,
            });
        });
    }

    // You might want to format the total value to 2 decimal places here
    invoiceItemsValue = parseFloat(invoiceItemsValue.toFixed(2));

    return {
        'invoiceItems': invoiceItems,
        'invoiceItemsValue': invoiceItemsValue
    };
}

function getShipmentDescription(invoiceItems) {
    if (Array.isArray(invoiceItems) && invoiceItems.length === 1) {
        return invoiceItems[0].Description || null;
    }

    return null;
}

function convertToExportFormat(data, order){
    try {
        const consigneeData = data['ConsigneeAddress'];
        const packages = getPackageForExportOrder(data);
        const invoiceItemsArray = getInvoiceItemsForExportOrderShopify(order);
        const invoiceItems = invoiceItemsArray['invoiceItems'];
        const invoiceItemsValue = invoiceItemsArray['invoiceItemsValue'];

        return {
            'Consignee': {
                'ContactPerson': consigneeData['ContactPerson'],
                'CompanyName': order.shipping_address.company || consigneeData['ContactPerson'],
                'AddressLine1': order.shipping_address.address1,
                'AddressLine2': order.shipping_address.address2,
                'City': consigneeData['CityName'],
                'State': order.shipping_address.province_code,
                'Postcode': consigneeData['ZipCode'],
                'Country': order.shipping_address.country_code,
                'Phone': consigneeData['Phone1'],
                'Email': consigneeData['ContactEmail']
            },
            'Packages': packages,
            'InvoiceItems': invoiceItems,
            'ProcessName': 11,
            'ShipmentValue': invoiceItemsValue,
            'ShipmentCurrency': order.presentment_currency || order.currency,
            'ShipmentDescription': getShipmentDescription(invoiceItems),
            'InvoiceFreightCharges': calculateTotalDiscountedShippingPrice(order),
        }
    } catch(e){
        console.log('convertToExportFormat ERROR ',e)
    }

    return data;
}

function calculateTotalDiscountedShippingPrice(orderData) {
    // Ensure the order object and shipping_lines exist and are valid
    if (!orderData || !orderData.shipping_lines || !Array.isArray(orderData.shipping_lines)) {
        console.error("Invalid order data or missing shipping lines array.");
        return 0;
    }

    let totalShippingCost = 0;

    // Iterate over each shipping line in the array
    orderData.shipping_lines.forEach(line => {
        // The price comes from the API as a string, so we convert it to a float
        const price = parseFloat(line.discounted_price);

        if (!isNaN(price)) {
            totalShippingCost += price;
        } else {
            console.warn(`Could not parse price for shipping line ID: ${line.id}`);
        }
    });

    // Return the total rounded to 2 decimal places for financial calculations
    return parseFloat(totalShippingCost.toFixed(2));
}

function getValidationErrorsArray(response) {
    let errors = [];

    const validationErrors = response?.ValidationErrors;

    if (validationErrors && typeof validationErrors === 'object') {
        for (const field in validationErrors) {
            const fieldErrors = validationErrors[field];

            if (Array.isArray(fieldErrors)) {
                errors.push(...fieldErrors);
            }
        }
    }

    return errors;
}

module.exports = {
    getShopifyRequestHeaders,
    getIntegrationData,
    getOrderData,
    saveOrderNote,
    saveOrderPickupPoint,
    orderIntegrationIsEnabled,
    orderAutomaticSendIsEnabled,
    getRestApiAccessToken,
    verifyHmac,
    verifyHmacWebhook,
    createHmacWebhook,
    isIpWhitelist,
    getAccessToken,
    insertAccessToken,
    isPickUpsShippingMethod,
    autoSendToUps,
    getFieldFromIntegrationData,
    restApiPrintLabel,
    mergePdf,
    saveOrderWeight,
    updatedMetafields,
    orderClosestPointsWhileSendToUpsIsEnabled,
    getShippingData,
    getClosestPoints,
    getResponseJsonAndSaveLogs,
    getDate,
    getCustomerTypeApi,
    getProductData,
    getMetafieldsCount,
    getReference2Field,
    getPickupPoint,
    sleep,
    getOrderPhoneNumber,
    getOrderCustomerName,
    validatePhoneNumber,
    getOrderAdditionalInfo,
    getNumberOfPackages,
    getOrderPickupsData,
    saveOrderTag,
    saveOrderTagError,
    getOrderWeight,
    saveWayBillNumberOnOrder,
    fullfillOrderItems,
    saveLeadIdOnOrder,
    isFulfillOrderItemsCustomerNotify,
    isFulfillOrderItemsEnabled,
    isGetWaybillStatusEnabled,
    isShippingMethodAllowCreateWaybill,
    formatDate,
    convertToExportFormat,
    isValidExportOrder,
    getValidationErrorsArray,
    isExportOrder
}
