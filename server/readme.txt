1. go to Settings -> Checkout
2. in Form options Section, change Shipping address phone number to Required
3. in Order processing Section, go to Additional Scripts and add this:

{% if checkout.shipping_method.title contains 'Access Points UPS' or checkout.shipping_method.title contains 'UPS PickUp' %}
<style>
.ups-pickups-button {
	width: 153px;
	height: 103px;
	font-family: ProtocolMFW,Arial,sans-serif !important;
	background-color: #25408f !important;
	background-position: center center !important;
	background-image: url('https://www.pickuppoint.co.il/api/eCommercePickupButton.jpg') !important;
	background-repeat: no-repeat !important;
	cursor: pointer !important;
}
.ups-pickups-button.hide {
	display: none;
}
.pick-ups-wrapper {
	direction: rtl;
}
.pick-ups-wrapper .pick-ups-step__description {
	display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    align-items: center;
    direction: rtl;
}
.pick-ups-wrapper .pick-ups-step__description .ups-pickup-text {
	width: 100%;
}
.phone-number-wrapper .phone-number-input {
  position: relative;
}
.phone-number-wrapper label {
  display: block;
  font-size: .9rem;
  font-weight: 400;
  line-height: 2rem;
}
.phone-number-wrapper .phone-number-input input[type="tel"] {
  line-height: 1.8rem;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0.5rem 1.2rem;
  border: 0.1rem solid #d9d9d9;
  box-sizing: border-box;
}
.phone-number-wrapper .phone-number-input input[type="submit"]:focus,
.phone-number-wrapper .phone-number-input input[type="tel"]:focus {
  outline: none;
}
.phone-number-wrapper .phone-number-input input[type="submit"] {
    background: linear-gradient(to bottom, #6371c7, #5563c1);
    border-color: #3f4eae;
    box-shadow: inset 0 1px 0 0 #6774c8, 0 1px 0 0 rgba(22, 29, 37, 0.05), 0 0 0 0 transparent;
    color: #fff;
    padding: 0.65rem 1.6rem;
    position: absolute;
    left: 0;
    bottom: 0;
    line-height: 1.8em;
}
.phone-number-wrapper .phone-number-input input[type="submit"]:hover{
    outline: none;
    background: linear-gradient(to bottom, #5c6ac4, #4959bd);
}
.phone-number-wrapper .phone-number-message {
    color: #bf0711;
    font-weight: 600;
    font-size: .75rem;
}
</style>
<div class="section">
<div class="content-box">
  <div class="content-box__row text-container pick-ups-wrapper">
    <h2 class="heading-2 pick-ups-step__title">נקודת איסוף UPS:</h2>
    {% if order.note contains '{' %}
    <input type="hidden" id="order_note_pickup_json" value="{{order.note}}" />
    {% endif %}
      <div class="pick-ups-step__description">
        <p class="ups-pickup-text">טוען...</p>
        <div class="ups-pickups-data"></div>
        <div class="ups-pickups-button hide" onclick="window.PickupsSDK.onClick();return;"></div>
      </div>
    </div>
  </div>
</div>
{% endif %}
4.7. code should look like this: https://prnt.sc/wn7xkr
4.8. if you want to change position, copy the entire code and put it wherever you want