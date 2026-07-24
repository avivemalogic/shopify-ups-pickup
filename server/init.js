require("dotenv").config();
const { HOST, API_VERSION } = process.env;
const { getShopifyRequestHeaders, getResponseJsonAndSaveLogs, getDate } = require('./helper');
const shippingDataFieldsObject = require('../data/shipping_data_fields.json')
const PLUGIN_FIELDS_VERSION = "1.2.7";

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
            body: JSON.stringify({'shop': shop, 'accessToken': accessToken, 'isPrivate': true})
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
            if(shippingDataMetafields === null){
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
                const apiUrl = `https://${shop}/admin/api/${API_VERSION}/metafields.json`;
                const response = await fetch(apiUrl, shippingDataRequestOptions);

                await getResponseJsonAndSaveLogs('createPickUpsOptions', shop, apiUrl, shippingDataRequestOptions, response);

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
        const apiUrl = `https://${shop}/admin/api/${API_VERSION}/script_tags.json`;
        const response = await fetch(apiUrl, pickupPointScriptRequestOptions);

        await getResponseJsonAndSaveLogs('addPickupPointScripts', shop, apiUrl, pickupPointScriptRequestOptions, response);
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
        const apiUrl = `https://${shop}/admin/api/${API_VERSION}/carrier_services.json`;
        const addCarriersServiceResponse = await fetch(apiUrl, carrierServicesRequestOptions);

        await getResponseJsonAndSaveLogs('addCarriersService', shop, apiUrl, carrierServicesRequestOptions, addCarriersServiceResponse);
    } catch (e){
        //throw new Error(e);
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
        const apiUrl = `https://${shop}/admin/api/${API_VERSION}/webhooks.json`;
        const response = await fetch(apiUrl, webhookRequestOptions);

        await getResponseJsonAndSaveLogs('createWebhook', shop, apiUrl, webhookRequestOptions, response);
    } catch (e){
        //throw new Error(e);
    }
}

module.exports = {
    createPickUpsOptions,
    addPickupPointScripts,
    addCarriersService,
    createWebhook
}