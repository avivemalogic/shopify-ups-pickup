const { getClosestPoints, getProductData, getDate, getAccessToken, getShippingData } = require('../../server/helper');

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

function isCartMinimumPriceForClosestPoints(shippingDataFields, itemsTotalPrice){
    const closestPointsMinimumEnabled = shippingDataFields.find((item) => item.key === 'closestPointsMinimumEnabled').value;
    let closestPointsMinimumPrice = shippingDataFields.find((item) => item.key === 'closestPointsMinimum').value;
    if(closestPointsMinimumPrice > 0){
        closestPointsMinimumPrice *= 100;
    }

    return !(closestPointsMinimumEnabled === 'true' && closestPointsMinimumPrice > 0 && itemsTotalPrice < closestPointsMinimumPrice);
}

export default async (req, res) => {
    const shop = req.headers['x-shopify-shop-domain'];
    const customerShippingAddress = req.body.rate.destination;

    res.statusCode = 200;

    if(!shop) {
        return res.end('Shop not Found');
    }

    const accessToken = await getAccessToken(shop);

    const shippingDataJson = await getShippingData(shop, accessToken);

    const shippingDataFields = shippingDataJson.metafields;

    const isEnabled = shippingDataFields.find((item) => item.key === 'closestPointsEnabled').value;
    const serviceName = shippingDataFields.find((item) => item.key === 'closestPointsTitle').value;
    const methodPrice = shippingDataFields.find((item) => item.key === 'closestPointsPrice').value;
    const methodPriceAfterMaxAmount = shippingDataFields.find((item) => item.key === 'closestPointsMaxPrice').value;
    const methodMaxAmount = shippingDataFields.find((item) => item.key === 'closestPointsMaxAmount').value;
    const methodMaxWeight = shippingDataFields.find((item) => item.key === 'closestPointsMaxWeight').value;
    const productFreeShippingEnabled = shippingDataFields.find((item) => item.key === 'productFreeShippingEnabled');
    const isProductFreeShippingEnabled = productFreeShippingEnabled !== undefined ? productFreeShippingEnabled.value : '';
    const cartItems = req.body.rate.items;
    const itemsTotalPrice = cartItems.reduce( ( sum, { price, quantity } ) => sum + (price * quantity) , 0);
    const itemsTotalWeightGrams = cartItems.reduce( ( sum, { grams, quantity } ) => sum + (grams * quantity) , 0);

    if(isEnabled !== 'true' || !methodPrice || methodPrice === 'X' || !isCartMinimumPriceForClosestPoints(shippingDataFields, itemsTotalPrice)) {
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

    let freeShipping = false;
    if(isProductFreeShippingEnabled === 'true'){
        for(let i = 0, iLength = cartItems.length; i < iLength; ++i){
            const productId = cartItems[i].product_id;

            const productData = await getProductData(shop, accessToken, productId);
            try {
                const productTagIsFreeShipping = productData.product.tags.includes('pickup_free');
                if(productTagIsFreeShipping){
                    freeShipping = true
                }else{
                    freeShipping = false;
                    break;
                }
            } catch (e) {
                freeShipping = false;
                break;
            }
        }
    }

    if(freeShipping){
        price = 0;
    }

    try {
        const data = await getClosestPoints(shop, shippingDataJson, customerShippingAddress);

        if(data['errors']){
            console.log(getDate()+' shipping-rates shop: '+shop+' | errors: ', data);
            return res.end(data['errors']);
        }

        const output = {
            "rates": getAvailableRates(data['response'], serviceName, price)
        };

        console.log(getDate()+' shipping-rates shop: '+shop+' | output: ', output);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(output))
    } catch (e){
        return res.end(JSON.stringify(e));
    }
}