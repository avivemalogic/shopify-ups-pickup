require("dotenv").config();
const { HOST, API_VERSION } = process.env;
const { getShopifyRequestHeaders } = require('./helper');
const shippingDataFieldsObject = require('../data/shipping_data_fields.json')

/**
 * Add Shipping Method Options
 */
async function createPickUpsOptions(shop, accessToken){

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
    shippingDataFieldsObject.forEach(async (item) => {
        if(shippingDataMetafields !== null){
            if(shippingDataMetafields.find((field) => field.key === item.key) !== undefined){
                return;
            }
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
                        "value_type": item.value_type
                    }
            })
        };
        try {
            await fetch(`https://${shop}/admin/api/${API_VERSION}/metafields.json`, shippingDataRequestOptions);
        } catch (e){
            throw new Error(e);
        }
    });
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
        console.log('pickupPointGetScriptRequestOptions Error: ', e);
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
        await fetch(`https://${shop}/admin/api/${API_VERSION}/script_tags.json`, pickupPointScriptRequestOptions);
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
        await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, webhookRequestOptions);
    } catch (e){
        throw new Error(e);
    }
}

module.exports = {
    createPickUpsOptions,
    addPickupPointScripts,
    createWebhook
}