
const testButton = document.querySelector('.input-modal-trigger');
testButton.addEventListener('click', () => alert('It\'s time to get ILL!!'));

let homePageSelector = document.querySelector('.css-selector');
console.log('SELECTOR?', homePageSelector.innerText, 'AND ANOTHER THING!', document.querySelector('.selector'), 'PARENT: ', window.parent);
homePageSelector.innerText = localStorage.getItem('home') || '';
// document.querySelector('.items_in_cart_selector').innerHTML = localStorage.getItem("items_in_cart");
//
rawData = atob(sr_$.model.data).split('&')
trackingObj = {};
rawData.forEach((a)=> {i = a.split('='), trackingObj[i[0]] = i[1]});
//
// document.querySelector('input.selector').innerHTML = trackingObj["page_type"];

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
// items_in_cart_selector.addEventListener('keyup', (e) => {
//     document.querySelector('.items_in_cart_new').innerHTML = document.querySelector(items_in_cart_selector.value)
//         && document.querySelector(items_in_cart_selector.value).innerText;
// });
//
let validate = document.querySelector('.update-selector');
validate.addEventListener('click', () => {
    alert('YOU PUSHED ANOTHER BUTTON!')

    // if (homePageSelector.innerText) {
    //     localStorage.setItem("home", homePageSelector.innerText);
    // }
    // if (page_type_selector.value) {
    //     localStorage.setItem("page_type", page_type_selector.value);
    // }
});
