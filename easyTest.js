const testButton = document.querySelector('.input-modal-trigger');
testButton.addEventListener('click', () => document.querySelector('.input-modal').setAttribute('style', 'block'));

// document.querySelector('.page_type_selector').innerHTML = localStorage.getItem("page_type");
// document.querySelector('.items_in_cart_selector').innerHTML = localStorage.getItem("items_in_cart");
//
// rawData = "auth_token=&sr_browser_id=4e0908b5-24ca-452a-b321-83a09ce494f2&pik_session_id=a305d218-ed46-85b-4b61-a2655343568&retailer_code=WHBM&experiments=mso%3A2%2Cls_1%3A2&page_url=http%3A%2F%2Fpikmonitor.s-9.us%2Fdivs%2Fstaging%2FWHBM&page_title=WHBM+(Staging)&sku=&doc_id=&referrer=&page_id=1543868022003&utm_medium=null&utm_content=null&country=undefined&loyalty_id=undefined&customer_email=undefined&page_type=cart&cart_total=&cart_subtotal=38.94&cart_shipping=&cart_discount=&cart_gift_card=&cart_tax=&items_in_cart=".split('&'); //atob(sr_$.model.data).split('&')
// trackingObj = {};
// rawData.forEach((a)=> {i = a.split('='), trackingObj[i[0]] = i[1]});
//
// document.querySelector('.page_type').innerHTML = trackingObj["page_type"];
// document.querySelector('.items_in_cart').innerHTML = trackingObj["items_in_cart"];
// document.querySelector('.product_details').innerHTML = trackingObj["doc_id"] + ' ' + trackingObj["item_name"] + ' ' +trackingObj["item_price"];
//
// if (trackingObj["page_type"] === "category"
//     && (trackingObj["doc_id"] === "" || trackingObj["doc_id"] === undefined)
//     && (trackingObj["item_name"] === "" || trackingObj["item_name"] === undefined)
//     && (trackingObj["item_price"] === "" || trackingObj["item_price"] === undefined)
// ) {
//     document.querySelector('.pass_fail').innerHTML = "TRUE";
// } else {
//     document.querySelector('.pass_fail').innerHTML = "FALSE";
// }
//
// let page_type_selector = document.querySelector('[name="page_type"]');
// page_type_selector.addEventListener('keyup', (e) => {
//     document.querySelector('.page_type_new').innerHTML = document.querySelector(page_type_selector.value)
//         && document.querySelector(page_type_selector.value).innerText;
// });
//
// let items_in_cart_selector = document.querySelector('[name="items_in_cart"]');
// items_in_cart_selector.addEventListener('keyup', (e) => {
//     document.querySelector('.items_in_cart_new').innerHTML = document.querySelector(items_in_cart_selector.value)
//         && document.querySelector(items_in_cart_selector.value).innerText;
// });
//
// let validate = document.querySelector('[type="submit"]');
//
// validate.addEventListener('click', () => {
//     if (items_in_cart_selector.value) {
//         localStorage.setItem("items_in_cart", items_in_cart_selector.value);
//     }
//     if (page_type_selector.value) {
//         localStorage.setItem("page_type", page_type_selector.value);
//     }
// });