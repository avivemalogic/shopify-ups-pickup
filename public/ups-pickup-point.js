async function orderContainPickupPoint(HOST, shop, orderId){
    const getOrderResponse = await fetch(`${HOST}api/get-order-pickup-point`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId})
    });

    if (getOrderResponse.status !== 200) {
        return {'errors': `${getOrderResponse.status} - ${getOrderResponse.statusText}`}
    }
    const orderMetafields = await getOrderResponse.json();

    return orderMetafields.metafields.find((item) => item.key === 'pickups_point_json');
}

async function orderContainWayBillNumber(HOST, shop, orderId){
    const getWaybillNumberResponse = await fetch(`${HOST}api/get-waybill-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'shop': shop, 'orderId': orderId })
    });

    const getWaybillNumberJson = await getWaybillNumberResponse.json();

    let orderSentToUps = false;
    getWaybillNumberJson.metafields.forEach((item) => {
        if(item.key === 'pickups_point_wb'){
            orderSentToUps = item.value;
        }
    })

    return orderSentToUps;
}

async function saveOrderPhoneNumber(HOST, shop, orderId, phoneNumber){
    await fetch(`${HOST}api/save-order-phone-number`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({'shop': shop, 'orderId': orderId, 'phoneNumber': phoneNumber})
    });

    return true;
}

async function getOrder(HOST, shop, orderId){
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

function validatePhoneNumber(phoneNumber){
    if(!phoneNumber) return false;
    return phoneNumber.replace(' ','').replace('+972','0').replace(/-/g, '').match(/^0(5[^7])[0-9]{7}$/);
}

function isValidPhoneNumber(phoneNumber){
    return !!validatePhoneNumber(phoneNumber);
}

function hidePickUpsButton(text){
    document.querySelector('.ups-pickups-button').remove();
    document.querySelector('.ups-pickup-text').innerHTML = text;
}

(async function () {
    const HOST = 'https://shopify.emalogic.com/';
    const orderId = Shopify.checkout.order_id;
    const shop = Shopify.Checkout.apiHost;

    const isContainPickupPoint = await orderContainPickupPoint(HOST, shop, orderId);

    const orderData = await getOrder(HOST, shop, orderId);

    if(!orderData['errors']){
        const phoneNumber = orderData.order.shipping_address.phone;
        if(!isValidPhoneNumber(phoneNumber)){
            const phoneNumberWrapperElm = document.createElement('div');
            phoneNumberWrapperElm.className = 'phone-number-wrapper';
            phoneNumberWrapperElm.innerHTML = `<label>מספר הטלפון לא מעודכן, אנא עדכן אותו</label>
            <form action="" class="phone-number-input">
                <input type="tel" value="" />
                <input type="submit" id="savePhoneNumber"value="שמור" />
            </form>
            <div class="phone-number-message"></div>`;

            document.querySelector('.pick-ups-wrapper').appendChild(phoneNumberWrapperElm);

            phoneNumberWrapperElm.querySelector('.phone-number-input').addEventListener('submit', function(e){
                e.preventDefault();

                const phoneNumberMessageElm = phoneNumberWrapperElm.querySelector('.phone-number-message');
                phoneNumberMessageElm.innerText = '';
                const phoneNumber = phoneNumberWrapperElm.querySelector('input[type="tel"]').value;
                const validPhoneNumber = validatePhoneNumber(phoneNumber);
                if(validPhoneNumber){
                    saveOrderPhoneNumber(HOST, shop, orderId, validPhoneNumber[0]);
                    phoneNumberWrapperElm.innerHTML = '<strong style="color: #4bb543;">מספר הטלפון נשמר!</strong>';

                    return true;
                }

                phoneNumberMessageElm.innerText = 'נא להזין מספר נייד תקין לקבלת מסרון בהגעת המשלוח לנקודת האיסוף'
                return true;
            });
        }
    }

    await addTrackingNumberLink();

    if(isContainPickupPoint) {
        const pkps_location = JSON.parse(isContainPickupPoint.value);
        pickup_render_description(pkps_location);
        hidePickUpsButton('');
    } else {
        let upsPickupsType = 'all';
        let upsPickupsMapType = 'test';
        let upsPickupsOpenMapOnLoad = false;

        const upsPickupTextElm = document.querySelector('.ups-pickup-text');
        if(upsPickupTextElm === null) return;
        upsPickupTextElm.innerHTML = '';

        try {
            const shippingDataResponse = await fetch(`${HOST}api/get-shipping-data`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({'shop': shop})
            });
            const shippingMetafields = await shippingDataResponse.json();
            const upsPickupsTypeField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsType');
            upsPickupsType = upsPickupsTypeField.value;
            const upsPickupsMapTypeField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsMapType');
            upsPickupsMapType = upsPickupsMapTypeField.value;
            const upsPickupsOpenMapOnLoadField = shippingMetafields.metafields.find((item) => item.key === 'upsPickupsOpenMapOnLoad');
            if(upsPickupsOpenMapOnLoadField !== undefined){
                upsPickupsOpenMapOnLoad = upsPickupsOpenMapOnLoadField.value === 'true';
            }
        } catch (error) {
           console.log(error);
        }

        const upsPickupsMapTest = upsPickupsMapType === 'test' ? 'beta.' : '';

        const pkp = document.createElement('script');
        pkp.type = 'text/javascript';
        pkp.async = true;
        pkp.src = `https://${upsPickupsMapTest}pickuppoint.co.il/api/ups-pickups.sdk.${upsPickupsType}.js?r=2.0`;
        const scriptTag = document.getElementsByTagName('script')[0];
        scriptTag.parentNode.insertBefore(pkp, scriptTag);

        const orderNotePickupJsonInput = document.getElementById('order_note_pickup_json');
        if(orderNotePickupJsonInput !== null){
            const pkps_location = JSON.parse(orderNotePickupJsonInput.value);
            pickup_render_description(pkps_location);
        }else {
            document.querySelector('.ups-pickups-button').classList.remove('hide');

            if(upsPickupsOpenMapOnLoad) {
                const onClickInterval = setInterval(function () {
                    if (window.PickupsSDK !== undefined) {
                        window.PickupsSDK.onClick();
                        clearInterval(onClickInterval);
                    }
                }, 500);
            }
        }

        document.body.addEventListener('pickups-after-choosen', async function (e, data) {
            const pkps_location = e.detail;
            const pickupPoint = JSON.stringify(pkps_location);
            document.querySelector('.ups-pickup-text').innerHTML = '<strong style="color: #4bb543;">הנקודה שבחרת נשמרה!</strong>';

            if(await orderContainWayBillNumber(HOST, shop, orderId)){
                hidePickUpsButton('לא ניתן לשנות את נקודת האיסוף');
                return {'errors': `Order already sent to Ups and WayBill Number created`}
            }

            pickup_render_description(pkps_location);

            const getOrderResponse = await fetch(`${HOST}api/save-order-pickup-point`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({'shop': shop, 'orderId': orderId, 'pickupPoint': pickupPoint})
            });

            if (getOrderResponse.status !== 200) {
                return {'errors': `${getOrderResponse.status} - ${getOrderResponse.statusText}`}
            }
            await getOrderResponse.json();
        });
    }

    function pickup_render_description(pkps_location){
        const html = "<br /><b>" + pkps_location.title + "</b>&nbsp;(" + pkps_location.iid + ")<br />" + pkps_location.city + ", " + pkps_location.street + "<br /><small>" + pkps_location.zip + "</small>";
        document.querySelector('div.ups-pickups-data').innerHTML = html;
    }

    async function addTrackingNumberLink(){
        const wb = await orderContainWayBillNumber(HOST, shop, orderId);

        if(wb) {
            const html = `<div class="section">
                <div class="content-box">
                  <div class="content-box__row text-container pick-ups-wrapper">
                    <h2 class="heading-2 pick-ups-step__title">Tracking Number</h2>
                    
                      <div class="pick-ups-step__description">
                            <a href="https://site.ship.co.il/?trackNumber=${wb}" target="_blank">${wb}</a>
                      </div>
                    </div>
                  </div>
                </div>
                <style>
                .thank-you__additional-content + .section {
                    padding-top: 1em;
                }
                </style>`;

            document.querySelector('[data-step="thank_you"] .step__sections > .section:last-child').insertAdjacentHTML("beforebegin", html);
        }
    }
})();
