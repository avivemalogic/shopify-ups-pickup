require("dotenv").config();
const { HOST, API_VERSION } = process.env;
const { getShopifyRequestHeaders, getResponseJsonAndSaveLogs, getDate } = require('./helper');
const shippingDataFieldsObject = require('../data/shipping_data_fields.json')
const PLUGIN_FIELDS_VERSION = "1.1.4";

/**
 * Add Shipping Method Options
 */
async function createPickUpsOptions(shop, accessToken, install = false){
    try {
        const getShippingData = await fetch(`${HOST}api/get-shipping-data`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({'shop': shop, 'isPrivate': true})
        });
        const getShippingDataJson = await getShippingData.json();

        const shippingDataMetafields = getShippingDataJson.metafields;

        if(shippingDataMetafields === undefined){
            return;
        }

        if(install){
            shippingDataFieldsObject.push({
                "namespace": "pickups-options",
                "key": "latestInstallation",
                "value": new Date().toDateString(),
                "type": "string"
            });
        }else {
            const currentFieldsVersion = shippingDataMetafields.find((item) => item.key === 'fieldsVersion');
            if (currentFieldsVersion !== undefined && currentFieldsVersion.value === PLUGIN_FIELDS_VERSION) {
                return;
            }
        }

        shippingDataFieldsObject.forEach(async (item) => {
            if(shippingDataMetafields === null || item.key === 'closestPointsMaxPrice' || item.key === 'closestPointsMaxAmount' || item.key === 'upsApiUrl' || item.key === 'upsApiCreateUrl'){
                return;
            }

            if(item.key !== 'fieldsVersion' && shippingDataMetafields.find((field) => field.key === item.key) !== undefined){
                return;
            }

            const shippingDataRequestOptions = {
                method: 'POST',
                headers: getShopifyRequestHeaders(accessToken),
                body: JSON.stringify({
                    "metafield":
                        {
                            "namespace": item.namespace,
                            "key": item.key,
                            "value": item.value,
                            "type": item.type
                        }
                })
            };
            try {
                const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/metafields.json`, shippingDataRequestOptions);

                await getResponseJsonAndSaveLogs('createPickUpsOptions', shippingDataRequestOptions, response);

            } catch (e){
                throw new Error(e);
            }
        });
    } catch (e){
        throw new Error(e);
    }
}

/**
 * Add Pickup Point Script
 */
async function addPickupPointScripts(shop, accessToken){
    const scriptFileSource = `${HOST}ups-pickup-point.js`;

    const pickupPointGetScriptRequestOptions = {
        method: 'GET',
        headers: getShopifyRequestHeaders(accessToken)
    };

    try {
        const pickupPointGetScriptResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/script_tags.json`, pickupPointGetScriptRequestOptions);
        const pickupPointGetScriptJson = await pickupPointGetScriptResponse.json();
        const scriptTagInstalled = pickupPointGetScriptJson.script_tags.findIndex(item => item.src === scriptFileSource) > -1;

        if(scriptTagInstalled){
            return;
        }
    } catch (e){
        console.log(getDate()+' pickupPointGetScriptRequestOptions Error: ', e);
    }

    const pickupPointScriptRequestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "script_tag": {
                "event": "onload",
                "src": scriptFileSource,
                "display_scope": "order_status"
            }
        })
    };

    try {
        const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/script_tags.json`, pickupPointScriptRequestOptions);

        await getResponseJsonAndSaveLogs('addPickupPointScripts', pickupPointScriptRequestOptions, response);
    } catch (e){
        throw new Error(e);
    }
}

/**
 * Add Carrier Services
 */
async function addCarriersService(shop, accessToken){

    const carrierServicesRequestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "carrier_service": {
                "name": "Pick Ups Service",
                "handle": "pick_ups_service",
                "callback_url": `${HOST}api/shipping-rates`,
                "service_discovery": true
            }
        })
    };

    try {
        const addCarriersServiceResponse = await fetch(`https://${shop}/admin/api/${API_VERSION}/carrier_services.json`, carrierServicesRequestOptions);

        await getResponseJsonAndSaveLogs('addCarriersService', carrierServicesRequestOptions, addCarriersServiceResponse);
    } catch (e){
        throw new Error(e);
    }
}

async function createWebhook(topic, address, shop, accessToken){
    const webhookRequestOptions = {
        method: 'POST',
        headers: getShopifyRequestHeaders(accessToken),
        body: JSON.stringify({
            "webhook": {
                "topic": topic,
                "address": `${HOST}api/webhook/${address}`,
                "format": "json"
            }
        })
    };

    try {
        const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, webhookRequestOptions);

        await getResponseJsonAndSaveLogs('createWebhook', webhookRequestOptions, response);
    } catch (e){
        throw new Error(e);
    }
}

module.exports = {
    createPickUpsOptions,
    addPickupPointScripts,
    addCarriersService,
    createWebhook
}