const { HOST } = process.env;
const { getClosestPoints, getFieldFromIntegrationData, getRestApiAccessToken } = require('../../server/helper');

function getAvailableRates(data, serviceNamePrefix, price){
    const arr = [];

    for(let i = 0, iLength = data.length; i < iLength; ++i){
        let serviceName = serviceNamePrefix ? serviceNamePrefix+' - ' : '';
        const serviceDescription = data[i].StreetName+ ' '+data[i].HouseNumber+', '+data[i].CityName;
        let distance;
        try {
            distance = Number(data[i].Distance).toFixed(2);
        } catch(e){
            distance = data[i].Distance;
        }
        arr.push({
            "service_name": serviceName+data[i].PointName +' '+ serviceDescription+' ('+distance+' ק"מ)',
            "service_code": 'pickups_'+data[i].PointID,
            "description": "",
            "total_price": price,
            "currency": "ILS"
        });
    }

    return arr;
}

export default async (req, res) => {
    const shop = req.headers['x-shopify-shop-domain'];
    const customerShippingAddress = req.body.rate.destination;

    res.statusCode = 200;

    if(!shop) {
        return res.end('Shop not Found');
    }

    const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'isPrivate': true})
    });
    const shippingDataJson = await shippingDataResponse.json();
    const shippingDataFields = shippingDataJson.metafields;

    const isEnabled = shippingDataFields.find((item) => item.key === 'closestPointsEnabled').value;
    const serviceName = shippingDataFields.find((item) => item.key === 'closestPointsTitle').value;
    const methodPrice = shippingDataFields.find((item) => item.key === 'closestPointsPrice').value;
    const methodPriceAfterMaxAmount = shippingDataFields.find((item) => item.key === 'closestPointsMaxPrice').value;
    const methodMaxAmount = shippingDataFields.find((item) => item.key === 'closestPointsMaxAmount').value;
    const methodMaxWeight = shippingDataFields.find((item) => item.key === 'closestPointsMaxWeight').value;
    const itemsTotalPrice = req.body.rate.items.reduce( ( sum, { price, quantity } ) => sum + (price * quantity) , 0);
    const itemsTotalWeightGrams = req.body.rate.items.reduce( ( sum, { grams, quantity } ) => sum + (grams * quantity) , 0);

    if(isEnabled !== 'true' || !methodPrice || methodPrice === 'X') {
        return res.end('Closest Points is Disabled');
    }

    let price = methodPrice * 100;
    if(itemsTotalPrice >= (methodMaxAmount * 100)){
        price = methodPriceAfterMaxAmount * 100;
    }

    if(methodMaxWeight !== 'X' && methodMaxWeight > 0 && itemsTotalWeightGrams > 0){
        if(itemsTotalWeightGrams > (Number(methodMaxWeight) * 1000)) {
            const errorMessage = 'Order Items are overweight';
            console.log(errorMessage);
            return res.end(errorMessage);
        }
    }

    try {
        const data = await getClosestPoints(shop, shippingDataJson, customerShippingAddress);

        if(data['errors']){
            return res.end(data['errors']);
        }

        const output = {
            "rates": getAvailableRates(data['response'], serviceName, price)
        };

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(output))
    } catch (e){
        return res.end(e);
    }
}