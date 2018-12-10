// Loaded on the external site's product page
(function ($) {
    'use strict';
    var doc = top.document;

    var iframe = doc.getElementById('spring_product_bookmarklet');
    var $scripts = $('.spring_bookmarklet_script');
    var script = $scripts[0];

    // NOTE(maia): we're gonna copy-paste the whole underscore.js library at the
    // bottom of this file, wait for it...
    var _;

    // Force-timeout for scraper.js AND wait time for bookmarklet UI
    var buttonTimeoutMs = 4000;

    // Arbitrary separator string for splatting keys together in sortVariants.
    var SEPARATOR = "-|-";

    var noMatchingElementsMsg = 'There are no elements that match';

    var springDomain = (script && script.getAttribute('data-domain')) ||
        'https://brands.shopspring.com';

    if (iframe) {
        iframe.style.visibility = 'visible';
        iframe.style.display = 'block';
    }

    function init() {
        log('Bookmarklet jQuery version', $.fn.jquery);
        log('Global jQuery version',
            window.jQuery ? window.jQuery.fn.jquery : 'No jQuery found');

        // NOTE(maia): dirty hack to ensure that Shoezoo correctly JSONifies arrays.
        // (They use an ancient version of prototype.js so their Array.toJSON method
        // is borked; we delete that method so that the default is used instead.)
        // var hostname = window.location.host.replace(/^www\./, '');
        // if (hostname === 'shoezoo.com') {
        //   delete Array.prototype.toJSON;
        // }

        addEvent(window, 'message', onMessage);
        var displayMode = !!iframe ? iframe.className : 'phantomJS';
        if (displayMode == 'large-screen') {
            // If we're in the large screen mode, we can shrink the host page, and keep
            // the panel on the right-hand side, w/o overlapping with the page contents.
            adjustHostPageWidth();
            sendMessage('script:loaded', 'right-frame');
        } else {
            // If we're on the regular screen, we're sending iframe's class name to the
            // GUI, so it can adjust left- and right-side display accordingly.
            sendMessage('script:loaded', displayMode);
        }
    }

    function adjustHostPageWidth() {
        var fullWidth = $('body').width();
        // Subtract 500px that is to be taken by bookmarklet iframe.
        var reducedWidth = fullWidth - 500;
        $('body').width(reducedWidth + 'px');
    }

    var onMessage = function (e) {
        e = e || window.event;
        if (e.origin != springDomain) {
            return;
        }
        var messageObject = JSON.parse(e.data);
        var message = messageObject.msg;
        var data = messageObject.data;

        if (message === 'run:main') {
            main();
        } else if (message === 'scrapeCurrentPage') {
            var scraperResult = scrapeCurrentPage(data);
            var returnData = {
                productData: scraperResult.productData,
                errors: scraperResult.errors
            };
            sendMessage('displayProduct', returnData);
        } else if (message === 'scrapeWholeProduct') {
            scrapeWholeProduct(data)
                .then(function(scraperResult) {
                    var returnData = {
                        productData: scraperResult.productData,
                        errors: scraperResult.errors
                    };
                    sendMessage('displayProduct', returnData);
                })
                .fail(function(result) {
                    // TODO(maia): handle this error properly. Or, like, at all.
                    log('Failure in async function:', result);
                });
        }
    };

    // accounting for IE8 --- kind of dumb...
    function addEvent(obj, type, fn) {
        return obj.attachEvent ? obj.attachEvent('on', type, fn) :
            obj.addEventListener(type, fn, false);
    }

    function queryDomUsingCss(selectorString, fieldType, selectAttr) {
        if (selectorString === '') {
            return {
                error: 'No selector string entered'
            };
        }
        // TODO(maia): error handling here for malformed snippets (e.g. ".hello[style='world").
        // (Especially tricky because sometimes the GUI will actually return w/o
        // erroring, but the scraper server will error--make sure to test for that.)
        var elems = $(selectorString);

        if (fieldType === 'bool') {
            return Boolean(elems.length > 0);
        } else {
            if (elems.length === 0) {
                return {error: noMatchingElementsMsg};
            }

            if (fieldType === 'jQuery') {
                return elems;
            } else if (fieldType === 'array') {
                return queryForMultipleValues(elems, selectAttr);
            } else if (fieldType === 'string') {
                return queryForSingleValue(elems, selectAttr);
            } else {
                return {error: 'Unknown field type: ' + fieldType};
            }
        }
    }

    function queryForSingleValue(elems, selectAttr) {
        if (elems.length > 1) {
            return {error: 'There are ' + elems.length + ' elements that match your query.'};
        } else {
            var stringToReturn;
            if (selectAttr) {
                stringToReturn = elems.attr(selectAttr);
                if (stringToReturn === undefined) {
                    return {error: 'There is no element with that selector and attribute'};
                }
            } else {
                stringToReturn = elems.html();
            }

            if (stringToReturn === '') {
                return {error: 'Selector returned an empty string'};
            }

            return stringToReturn;
        }
    }

    function queryForMultipleValues(elems, selectAttr) {
        var stringArray = [];
        var stringToAdd;
        for (var i = 0; i < elems.length; ++i) {
            if (selectAttr) {
                stringToAdd = elems.eq(i).attr(selectAttr);
                if (stringToAdd !== undefined) {
                    stringArray.push(stringToAdd);
                }
            } else {
                stringToAdd = elems.eq(i).html();
                if (stringToAdd !== undefined) {
                    stringArray.push(stringToAdd);
                }
            }
        }
        if (stringArray.length === 0) {
            return {error: noMatchingElementsMsg};
        } else if (stringArray.length !== elems.length) {
            log('Some, but not all, of the things returned by your selector ' +
                'were strings. Please investigate.');
            return stringArray;
        } else {
            return stringArray;
        }
    }

    function queryDomUsingSnippet(snippet, fieldName, fieldType) {
        if (snippet === '') {
            return {error: 'Snippet is blank'};
        }
        try {
            var callback = eval(snippet);  // jshint ignore:line
            if (typeof(callback) !== 'function') {
                return {error: 'Snippet must be a function'};
            }

            var queryResult = callback();

            if (fieldType === 'string') {
                if (queryResult === '') {
                    return {error: noMatchingElementsMsg};
                } else if (typeof(queryResult) !== 'string') {
                    return {error: 'Snippet must return a string'};
                }
            } else if (fieldType === 'array') {
                if (queryResult.constructor !== Array) {
                    return {error: 'Snippet must return an array'};
                } else if (queryResult.length === 0) {
                    return {error: noMatchingElementsMsg};
                } else {
                    // Loop through the returned values of the array
                    // and make sure they're all strings
                    for (var i = 0; i < queryResult.length; i++) {
                        if (typeof(queryResult[i]) !== 'string') {
                            return {error: 'Snippet must return an array of strings'};
                        }
                    }
                }
            } else if (fieldType == 'jQuery') {
                if (!(queryResult instanceof $)) {
                    return {error: 'Snippet must return a jQuery object'};
                } else if (queryResult.length === 0) {
                    return {error: noMatchingElementsMsg};
                }
            } else if (fieldType === 'bool') {
                if (typeof(queryResult) !== 'boolean') {
                    return {error: 'Snippet must return a boolean'};
                }
            } else {
                return {error: 'Unknown field type: ' + fieldType};
            }

            return queryResult;
        } catch (err) {
            log('[SNIPPET ERROR] (field: "' + fieldName + '"):', err);
            return {error: 'Snippet returned an error--<br>' + err.toString()};
        }
    }

    function sendMessage(msg, data) {
        if (!iframe) {
            return phantom.sendMessage(msg, data);
        } else {
            var messageWrapper = {
                msg: msg,
                data: (data || {})
            };

            iframe.contentWindow.postMessage(JSON.stringify(messageWrapper), springDomain);
        }
    }

    function main(messageFunc) {
        if (!!messageFunc) {
            phantom.setCallPhantom(messageFunc);
        }
    }

    function scrapeField(fieldName, fieldConfig, expectedType) {
        var queryResult;
        var type = fieldConfig.type || 'css';
        switch (type) {
            case 'js':
                var snippetString = fieldConfig.snippet;
                queryResult = queryDomUsingSnippet(snippetString, fieldName, expectedType);
                break;
            case 'css':
                var selectorString = fieldConfig.cssSelector;
                var attrSelector = fieldConfig.attribute;
                queryResult = queryDomUsingCss(selectorString, expectedType,
                    attrSelector);
                break;
            case 'text':
                queryResult = fieldConfig.text;
                break;
            default:
                queryResult = {error: 'Unknown scrape field type: ' + type};
                break;
        }

        if (!!countFieldErrors[fieldName] && queryResult.hasOwnProperty('error')) {
            var logMsg = 'training data error for field "' + fieldName + '": ';
            log(logMsg, queryResult.error);
            phantom.increment('scraper_server', 'training_data_errors', 1,
                {field: fieldName, config: type});
        }
        return queryResult;
    }

    // Scrape page for all product-level fields, and for the current variant
    // selected (no page interaction involved; response will contain a single
    // variant reflecting the current state of the page). Returns a promise
    // for the product data.
    function scrapeCurrentPage(trainingData) {
        var productData = {};
        var errors = {};

        // Checking for is_product first.
        var queryResult = scrapeField(IS_PRODUCT_KEY, trainingData[IS_PRODUCT_KEY],
            trainingDataSchema[IS_PRODUCT_KEY]);
        fieldQueryResultToProductDataOrError(
            IS_PRODUCT_KEY, queryResult, productData, errors);

        // Prevent scraping if the thing is not a product.
        if (productData.is_product) {
            scrapeProductFields(trainingData, productData, errors);

            // HACK(maia): scrape buttons and print them to the console for training
            // purposes, but don't attach to result, send for cleaning, etc.
            // TODO(maia): attach buttons to result, clean, display in GUI.
            var buttonConfigs = trainingData[VARIANT_DIMENSION_BUTTONS_KEY];
            for (var i = 0; i < buttonConfigs.length; i++) {
                var config = buttonConfigs[i];
                var activeButtons = scrapeField(
                    ACTIVE_BUTTONS_KEY,
                    config[ACTIVE_BUTTONS_KEY],
                    trainingDataVariantDimensionButtonSchema[ACTIVE_BUTTONS_KEY]);
                log(
                    'Active buttons for dimension "' + config[ATTRIBUTE_ID_KEY] +
                    '":', activeButtons);

                // Only scrape for and log the following for the last dimension
                if (i === buttonConfigs.length - 1) {
                    var inactiveButtonValues = scrapeField(
                        INACTIVE_BUTTON_VALUES_KEY,
                        config[INACTIVE_BUTTON_VALUES_KEY],
                        trainingDataVariantDimensionButtonSchema[INACTIVE_BUTTON_VALUES_KEY]);
                    log(
                        'Out-of-stock values for dimension "' +
                        config[ATTRIBUTE_ID_KEY] + '":', inactiveButtonValues);
                    var allValues = scrapeField(
                        ALL_BUTTON_VALUES_KEY,
                        config[ALL_BUTTON_VALUES_KEY],
                        trainingDataVariantDimensionButtonSchema[ALL_BUTTON_VALUES_KEY]);
                    log(
                        'All values for dimension "' +
                        config[ATTRIBUTE_ID_KEY] + '":', allValues);
                }
            }

            var currentVariant = scrapeCurrentVariant(trainingData[VARIANT_FIELDS_KEY]);
            // NOTE(maia): '/clean' endpoint expects an ARRAY of variants
            productData[VARIANT_RESULTS_KEY] = [currentVariant];
        }
        var scraperResult = {
            productData: productData,
            errors: errors
        };

        return scraperResult;
    }

    function fieldQueryResultToProductDataOrError(
        field, queryResult, productData, errors) {
        if (!queryResult.hasOwnProperty('error')) {
            productData[field] = queryResult;
        } else {
            errors[field] = queryResult.error;
        }
    }

    // Scrape page for all product info--i.e., product-level fields and
    // all variants. Returns a promise for the product data.
    function scrapeWholeProduct(trainingData) {
        // var scrapeId = phantom.onScrapeStarted({level: 'product'});
        var productData = {};
        var errors = {};
        var deferred = $.Deferred();

        // Checking for is_product first.
        var queryResult = scrapeField(IS_PRODUCT_KEY, trainingData[IS_PRODUCT_KEY],
            trainingDataSchema[IS_PRODUCT_KEY]);
        fieldQueryResultToProductDataOrError(
            IS_PRODUCT_KEY, queryResult, productData, errors);

        // Prevent scraping if the page is not a product.
        if (!productData.is_product) {
            var scraperResult = {
                productData: productData,
                errors: errors
            };
            deferred.resolve(scraperResult);
        } else {
            scrapeProductFields(trainingData, productData, errors);

            // TODO(maia): scrape allValues up here so we can do it before we start
            // clicking on things (and pass allValues and AttrName into SortVariants
            // rather than TD)
            constructVariants(
                trainingData[VARIANT_DIMENSION_BUTTONS_KEY],
                trainingData[VARIANT_FIELDS_KEY])
                .then(function(variants) {
                    productData[VARIANT_RESULTS_KEY] = sortVariants(variants, trainingData);
                    var scraperResult = {
                        productData: productData,
                        errors: errors
                    };

                    deferred.resolve(scraperResult);
                })
                .fail(function(result) {
                    // TODO(maia): handle this error properly. Or, like, at all.
                    log('Failure in async function:', result);
                });
        }

        // phantom.onScrapeFinished(scrapeId);
        return deferred.promise();
    }

    // Scrape page for product fields and store info in the target objects provided.
    function scrapeProductFields(trainingData, targetProductData, targetErrors) {
        var field;
        var expectedType;
        var queryResult;

        for (var i = 0; i < productFields.length; i++) {
            field = productFields[i];
            expectedType = trainingDataSchema[field];
            queryResult = scrapeField(field, trainingData[field], expectedType);
            fieldQueryResultToProductDataOrError(
                field, queryResult, targetProductData, targetErrors);
        }
    }

    // Recursively click through all variant dimension buttons so that we arrive
    // on every possible combination of attributes and can then scrape that page
    // state for the variant it represents. Returns a promise for an array of
    // variant objects.
    function constructVariants(buttonConfigs, variantFieldConfigs) {
        var workers = [];
        var config;
        var buttons;
        var i;
        var statLogInfo;

        if (buttonConfigs.length === 0) {
            // Scrape the current page state for the variant it represents, and fulfill promise.
            var variant = scrapeCurrentVariant(variantFieldConfigs);
            var deferred = $.Deferred();
            deferred.resolve([variant]);
            return deferred.promise();

        } else if (buttonConfigs.length === 1) {
            // Make workers to create OoS variants for all inactive button values (see
            // docstring for makeOutOfStockWorker).
            config = buttonConfigs[0];
            var attrId = config[ATTRIBUTE_ID_KEY];
            var attributeName;

            // Find the attribute config that corresponds to this button config (by
            // matching attribute_id's) so that we can scrape the name of this
            // attribute. If no matching attribute config found, assume the name of
            // this attribute = attribute_id.
            var attrConfigs = variantFieldConfigs[NAMED_ATTRIBUTES_KEY];
            var matchingAttrConfig;
            for (i = 0; i < attrConfigs.length; i++) {
                if (attrConfigs[i][ATTRIBUTE_ID_KEY] === attrId) {
                    matchingAttrConfig = attrConfigs[i];
                    break;
                }
            }
            if (matchingAttrConfig) {
                attributeName = scrapeField(
                    NAMED_ATTRIBUTES_KEY, matchingAttrConfig[ATTRIBUTE_NAME_KEY],
                    trainingDataVariantDimensionButtonSchema[NAMED_ATTRIBUTES_KEY]);
                if (attributeName.hasOwnProperty('error')) {
                    log('Encountered an error while scraping attribute name for "' + attrId +
                        '" to fill in attrs for OOS variants, using the hardcoded attribute id instead. ' +
                        '\nThe error:\n\t' + attributeName.error);
                    attributeName = attrId;

                    if (!iframe) {
                        // If running from server, log a stat.
                        statLogInfo = {
                            'category': 'scraper_server',
                            'name': 'attr_name_scrape_for_oos_backfill_fail',
                            'value': 1
                        };
                        sendMessage('increment', statLogInfo);
                    }
                }
            } else {
                log('No matching attribute config found for button "' +
                    attrId + '"" so attributes filled in for OOS variants' +
                    ' may be innacurate. Using the hardcoded attribute id instead.');
                attributeName = attrId;

                if (!iframe) {
                    // If running from server, log a stat.
                    statLogInfo = {
                        'category': 'scraper_server',
                        'name': 'no_matching_attr_for_button',
                        'value': 1
                    };
                    sendMessage('increment', statLogInfo);
                }
            }

            var inactiveButtonValues;
            if (config[INACTIVE_BUTTON_VALUES_KEY]) {
                inactiveButtonValues = scrapeField(
                    INACTIVE_BUTTON_VALUES_KEY,
                    config[INACTIVE_BUTTON_VALUES_KEY],
                    trainingDataVariantDimensionButtonSchema[INACTIVE_BUTTON_VALUES_KEY]);
            } else {
                log('No "inactive_button_values" config found for the lowest-level variant ' +
                    'dimension, "' + attrId + '". Unless you are getting in/out-of-stock ' +
                    'information from the "quantiy" selector, you should probably have an ' +
                    '"inactive_button_values" config set for this variant dimension.');
            }
            for (i = 0; i < inactiveButtonValues.length; ++i) {
                var attrsToFill = {};
                attrsToFill[attributeName] = inactiveButtonValues[i];
                workers.push(makeOutOfStockWorker(variantFieldConfigs, attrsToFill));
            }

            // Recurse on all active buttons at this level (i.e., make in-stock variants).
            buttons = scrapeField(ACTIVE_BUTTONS_KEY, config[ACTIVE_BUTTONS_KEY],
                trainingDataVariantDimensionButtonSchema[ACTIVE_BUTTONS_KEY]);
            if (buttons.hasOwnProperty('error')) {
                log('Error getting buttons for attribute "' +
                    config[ATTRIBUTE_ID_KEY] + '": ' + buttons.error);
                if (inactiveButtonValues.length === 0 || inactiveButtonValues.error) {
                    // NOTE(maia): if we didn't find any in-stock buttons OR OoS values
                    // for the lowest variant dimension, assume that this dimension isn't
                    // represented on the page (e.g., a product with only color options
                    // and no size options)--we still want to recurse. If we didn't find
                    // any in-stock buttons but DID find OoS values, it means that there
                    // are no in-stock options for this dimension at this point, and we
                    // should NOT recurse, since we've already accounted for all of the
                    // possible options in the OoS variants created above (and scraping
                    // the current page state could result in duplicate variants).
                    workers.push(makeInStockWorker(null /* buttonIndex */, buttonConfigs, variantFieldConfigs));
                }
            } else {
                for (i = 0; i < buttons.length; ++i) {
                    workers.push(makeInStockWorker(i, buttonConfigs, variantFieldConfigs));
                }
                // UGLY HACK FOR FRYE TO CLICK ON THE LAST ACTIVE SIZE BUTTON TO UNSELECT IT
                // SO THAT WE CAN MAKE SURE THAT ALL COLORS BECOME CLICKABLE AGAIN
                // TODO (jeff): set window._springBookmarkletReclickLastSize = true; for frye
                // and remove the hardcoded domain
                if (location.hostname === 'www.thefryecompany.com' ||
                    (config[ATTRIBUTE_ID_KEY].toLowerCase() === 'size' && window._springBookmarkletReclickLastSize)) {
                    workers.push(reClickLastButton(i-1, buttonConfigs, variantFieldConfigs));
                }
            }

        } else {
            // Make workers to click the next button and then recursively call constructVariants.
            config = buttonConfigs[0];
            buttons = scrapeField(ACTIVE_BUTTONS_KEY, config[ACTIVE_BUTTONS_KEY],
                trainingDataVariantDimensionButtonSchema[ACTIVE_BUTTONS_KEY]);
            if (buttons.hasOwnProperty('error')) {
                log('Error getting buttons for attribute "' +
                    config[ATTRIBUTE_ID_KEY] + '": ' + buttons.error);
                // NOTE(maia): even if we couldn't find any buttons for the dimension we're
                // scraping for, we want to continue recursing, so pass a null buttonIndex.
                workers.push(makeInStockWorker(null /* buttonIndex */, buttonConfigs, variantFieldConfigs));
            } else {
                for (i = 0; i < buttons.length; ++i) {
                    workers.push(makeInStockWorker(i, buttonConfigs, variantFieldConfigs));
                }
            }
        }

        return resolveAllWorkers(workers);
    }

    // Generate a function which, when called, scrapes buttons for the first
    // button config, clicks the button at the given index, recursively calls
    // constructVariants, and passes the results to the callback provided.
    function makeInStockWorker(buttonIndex, buttonConfigs, variantFieldConfigs) {
        return function(callback) {
            var currentButtonConfig = buttonConfigs[0];
            var remainingButtonConfigs = buttonConfigs.slice(1);
            var errorMsg;
            var onTimeout = function() {
                constructVariants(remainingButtonConfigs, variantFieldConfigs)
                    .then(function(result) {
                        callback(result);
                    })
                    .fail(function(result) {
                        // TODO(maia): handle this error properly. Or, like, at all.
                        log('Failure in async function:', result);
                    });
            };

            if (buttonIndex === null) {
                // NOTE(maia): this is an an expected case; we still want to continue
                // recursing, even if couldn't find any buttons for the dimension we
                // just tried to scrape, so we pass a null button index.
                onTimeout();
            } else {
                var buttons = scrapeField(ACTIVE_BUTTONS_KEY, currentButtonConfig[ACTIVE_BUTTONS_KEY],
                    trainingDataVariantDimensionButtonSchema[ACTIVE_BUTTONS_KEY]);
                if (buttons.hasOwnProperty('error')) {
                    // We encountered an error scraping for the buttons we wanted to click.
                    errorMsg = 'No buttons found for dimension "' + currentButtonConfig[ATTRIBUTE_ID_KEY] +
                        '". Nothing to click. We expected buttons here, so data is likely ' +
                        'inaccurate. Aborting scrape.';
                    logStatAndDieWithMessage('error_scraping_expected_buttons', errorMsg);

                } else if (buttons.eq(buttonIndex).length === 0) {
                    // Didn't throw an error scraping for the buttons, but there isn't a
                    // button at the index we want to click.
                    errorMsg = 'No button found for dimension "' + currentButtonConfig[ATTRIBUTE_ID_KEY] +
                        '" at index ' + buttonIndex + '. This may result in nondeterministic ' +
                        'data. Aborting scrape.';
                    logStatAndDieWithMessage('expected_button_not_found', errorMsg);

                } else {
                    phantom.setResourcesTimeout(onTimeout, buttonTimeoutMs);

                    // setResourcesTimeout waits for the completion of any requests
                    // starting AFTER IT IS CALLED (ignoring any previously pending
                    // requests); therefore, we call selectButton AFTER
                    // setResourcesTimeout so we ACTUALLY wait for any requests triggered
                    // by the button click.
                    var msg = '(dimension "' + currentButtonConfig[ATTRIBUTE_ID_KEY] +
                        '" at index ' + buttonIndex + ')';
                    var buttonToClick = buttons.eq(buttonIndex);
                    selectButton(buttonToClick, msg);
                }
            }
        };
    }

    // Works just like makeInStockWorker, except that instead of clicking the
    // button corresponding to the OoS variant, we scrape the current page state
    // to make a variant, fill in the  attribute value of the button we did not
    // click, and set quantity to 0. E.g. if we're looking at size as the last
    // variant dimension and the button for size "M" is inactive (according to our
    // inactive_button_values selector): make a variant by scraping the current
    // state of the page, set size = M, and set quantity = 0.
    function makeOutOfStockWorker(variantFieldConfigs, attrsToFill) {
        return function(callback) {
            phantom.setResourcesTimeout(function() {
                // NOTE(maia): passing in empty array as first arg. of constructVariants
                // in place of an empty buttonConfig list
                constructVariants([], variantFieldConfigs).then(function(result) {
                    var resultAttrs = result[0][NAMED_ATTRIBUTES_KEY];
                    for (var attr in attrsToFill) {
                        // Find the attr with a name matching the attr we're trying to fill
                        // in; if it exists, modify its value, and if not, create it.
                        var attrFound = false;
                        for (var i = 0; i < resultAttrs.length; i++) {
                            if (resultAttrs[i][ATTRIBUTE_NAME_KEY] === attr) {
                                resultAttrs[i][ATTRIBUTE_VALUE_KEY] = attrsToFill[attr];
                                attrFound = true;
                                break;
                            }
                        }
                        if (!attrFound) {
                            var newAttr = {};
                            newAttr[ATTRIBUTE_NAME_KEY] = attr;
                            newAttr[ATTRIBUTE_VALUE_KEY] = attrsToFill[attr];
                            resultAttrs.push(newAttr);
                        }
                    }
                    result[0][NAMED_ATTRIBUTES_KEY] = resultAttrs;
                    result[0][QUANTITY_KEY] = 0;
                    callback(result);
                });
            }, buttonTimeoutMs);
        };
    }

    // this is basically a copy of makeInstockWorker, except that in the onTimeout function
    // we don't attempt  to construct a variant, we just immediately callback...
    // and we pass an empty array to the callback so that we can concat the "rest" on to it
    // just like we would if we actually returned an array of data.
    // As of this functions's addition, (20180221) it is only used for frye to deactivate
    // the last active size for a variant.
    function reClickLastButton(buttonIndex, buttonConfigs, variantFieldConfigs) {
        return function(callback) {
            var currentButtonConfig = buttonConfigs[0];
            var remainingButtonConfigs = buttonConfigs.slice(1);
            var errorMsg;
            var onTimeout = function() {
                // callback an empty array so that we can still concat rest onto the result later
                callback([]);
            };

            if (buttonIndex === null) {
                // NOTE(maia): this is an an expected case; we still want to continue
                // recursing, even if couldn't find any buttons for the dimension we
                // just tried to scrape, so we pass a null button index.
                onTimeout();
            } else {
                var buttons = scrapeField(ACTIVE_BUTTONS_KEY, currentButtonConfig[ACTIVE_BUTTONS_KEY],
                    trainingDataVariantDimensionButtonSchema[ACTIVE_BUTTONS_KEY]);
                if (buttons.hasOwnProperty('error')) {
                    // We encountered an error scraping for the buttons we wanted to click.
                    errorMsg = 'No buttons found for dimension "' + currentButtonConfig[ATTRIBUTE_ID_KEY] +
                        '". Nothing to click. We expected buttons here, so data is likely ' +
                        'inaccurate. Aborting scrape.';
                    logStatAndDieWithMessage('error_scraping_expected_buttons', errorMsg);

                } else if (buttons.eq(buttonIndex).length === 0) {
                    // Didn't throw an error scraping for the buttons, but there isn't a
                    // button at the index we want to click.
                    errorMsg = 'No button found for dimension "' + currentButtonConfig[ATTRIBUTE_ID_KEY] +
                        '" at index ' + buttonIndex + '. This may result in nondeterministic ' +
                        'data. Aborting scrape.';
                    logStatAndDieWithMessage('expected_button_not_found', errorMsg);

                } else {
                    phantom.setResourcesTimeout(onTimeout, buttonTimeoutMs);

                    // setResourcesTimeout waits for the completion of any requests
                    // starting AFTER IT IS CALLED (ignoring any previously pending
                    // requests); therefore, we call selectButton AFTER
                    // setResourcesTimeout so we ACTUALLY wait for any requests triggered
                    // by the button click.
                    var msg = '(dimension "' + currentButtonConfig[ATTRIBUTE_ID_KEY] +
                        '" at index ' + buttonIndex + ')';
                    var buttonToClick = buttons.eq(buttonIndex);
                    selectButton(buttonToClick, msg);
                }
            }
        };
    }

    // Recursively resolve all worker functions: eventually, we'll end up with a
    // promise for a list in which each element is the result of the corresponding
    // worker function.
    function resolveAllWorkers(workers) {
        var deferred = $.Deferred();
        if (workers.length === 0) {
            deferred.resolve([]);
        } else {
            // NOTE(maia): Recall that each worker is a function that will take some
            // actions and then pass the results to the given callback. Here, we call
            // that worker function ('work') with the callback defined here: take the
            // result of the rest of the workers, concat those results together with
            // the result of THIS worker ('result'), and return (i.e. resolve
            // 'deferred' with the combined results).
            var work = workers.shift();
            work(function(result) {
                resolveAllWorkers(workers)
                    .then(function(rest) {
                        result = result.concat(rest);
                        deferred.resolve(result);
                    })
                    .fail(function(result) {
                        // TODO(maia): handle this error properly. Or, like, at all.
                        log('Failure in async function:', result);
                    });
            });
        }
        return deferred.promise();
    }

    // We want to return variants in the order in which they appear on the
    // website, but b/c of the way we select in-/out-of-stock variants, we return
    // variants out of order (e.g. given a product with fit, color, & size, we'll
    // return OOS before in-stock variants for every given fit/color combination).
    // This func scrapes an ordered list of values for the bottom-most dimension
    // and uses this list to sort the variants. (We want variants in the order:
    // [colorA+size1, colorA+size2, colorB+size1, colorB+size2].)
    function sortVariants(variants, trainingData) {
        if (variants.length <= 1) {
            // No sorting to do, return.
            // NOTE(maia): if we ever have a way to return multiple variants w/o the
            // use of button configs (e.g. with a snippet), we'll have to also check
            // here that we have at least one button config.
            return variants;
        }

        var buttonConfigs = trainingData[VARIANT_DIMENSION_BUTTONS_KEY];
        var lastDimensionButtonConfig = buttonConfigs[buttonConfigs.length - 1];
        var allValuesConfig = lastDimensionButtonConfig[ALL_BUTTON_VALUES_KEY];

        // Get all values for last dimension (regardless of in-/out-of-stock status)
        // in sorted order.
        var allValues = scrapeField('allValues', allValuesConfig,
            trainingDataVariantDimensionButtonSchema[ALL_BUTTON_VALUES_KEY]);
        if (allValues.hasOwnProperty('error')) {
            var type = allValues.type || 'css';
            var logMsg = 'training data error for field "all_button_values": ';
            log(logMsg, allValues.error);
            phantom.increment('scraper_server', 'training_data_errors', 1,
                {field: 'allValues', config: type});

            // We have no data with which to sort the variants, so just return.
            return variants;
        }

        // Find the attribute config that corresponds to this button config (by
        // matching attribute_id's) so that we know which attribute to sort by
        var attrId = lastDimensionButtonConfig[ATTRIBUTE_ID_KEY];
        var attrConfigs = trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY];
        var indexToSortBy = _.pluck(attrConfigs, ATTRIBUTE_ID_KEY).indexOf(attrId);


        if (indexToSortBy === -1) {
            log('No matching attribute config found for button "' +
                attrId + '"" so unable to sort variants.');
            return variants;
        }

        return bucketAndSort(variants, indexToSortBy, allValues);
    }

// `Variants` is a list of variants to sort, ordered by the first n-1 attributes
// and potentially un-ordered for the last. E.g.: petite/blue/M, petite/blue/S,
// petite/red/M, petite/red/L, regular/blue/M, regular/blue/S... We bucket
// together variants that share the first n-1 attribute values, and then within
// the buckets, sort by the canonical order of the sort-attribute, which we
// scrape from the page (`attrSortOrder`) We identify the sort-attribute by its
// index (`attrIndexToSortBy`), i.e. it's position in variant.attributes
    function bucketAndSort(variants, attrIndexToSortBy, attrSortOrder) {
        var bucketedVariants = bucketVariantsByUnsortedAttrs(variants, attrIndexToSortBy);

        var sortedBucketedVariants = _.map(bucketedVariants, function(bucket) {
            return _.sortBy(bucket, function(variant) {
                // Sort contents of each bucket according the sort-attribute's value's
                // position in attrSortOrder.
                var index = attrSortOrder.indexOf(variant[NAMED_ATTRIBUTES_KEY][attrIndexToSortBy][ATTRIBUTE_VALUE_KEY]);
                if (index === -1) {
                    log('WARNING: ' + variant[NAMED_ATTRIBUTES_KEY][attrIndexToSortBy][ATTRIBUTE_NAME_KEY] +
                        ' value ' + variant[NAMED_ATTRIBUTES_KEY][attrIndexToSortBy][ATTRIBUTE_VALUE_KEY] +
                        ' not found in ordered values list (allValues).');
                }
                return index;
            });
        });

        return _.flatten(sortedBucketedVariants);
    }

// Given an array of variants and an index to ignore, bucket together variants
// that share common values of all attributes except the one at index
// `indexToIgnore`.
    function bucketVariantsByUnsortedAttrs(variants, indexToIgnore) {
        var allBuckets = [];
        var curBucket = [];
        var curBucketString = variantBucketString(variants[0], indexToIgnore);
        for (var i = 0; i < variants.length; i++) {
            if (variantBucketString(variants[i], indexToIgnore) === curBucketString) {
                curBucket.push(variants[i]);
            } else {
                allBuckets.push(curBucket);
                curBucket = [variants[i]];
                curBucketString = variantBucketString(variants[i], indexToIgnore);
            }
        }

        if (curBucket.length > 0) {
            allBuckets.push(curBucket);
        }

        return allBuckets;
    }

// Splats the values of all attributes except the one at `indexToIgnore` into a
// string that we can use group attributes into buckets.
    function variantBucketString(variant, indexToIgnore) {
        var attributes = variant[NAMED_ATTRIBUTES_KEY];
        var relevantAttrValues = [];
        for (var i = 0; i < attributes.length; i++) {
            if (i != indexToIgnore) {
                relevantAttrValues.push(attributes[i][ATTRIBUTE_VALUE_KEY]);
            }
        }
        return relevantAttrValues.join(SEPARATOR);
    }

    // NOTE(maia): if you change the name of this func., you will have to modify
    // the `page.onError` method in scraper.js!
    function selectButton(jQueryButton, logMsg) {
        var buttonTitle = getButtonTitle(jQueryButton);
        log('Selecting button: ' + buttonTitle + ' ' + (logMsg || ''));

        // NOTE(vadim/maia): We select the button via the DOM/pure JavaScript,
        // because using our jQuery's click() and/or val().change() methods doesn't
        // work for some brands (e.g. Everlane) which use their own jQuery.
        // (Presumably, the site is listening for jQ events from THEIR jQ version
        // and not ours.)
        if (jQueryButton.is('option')) {
            // If button is an <option> element in a <select>, we can't just click it, need
            // to set value instead (and trigger a change so any event listeners fire).
            var buttonVal = jQueryButton.val();
            var parentDomNode = jQueryButton.parent('select')[0];
            parentDomNode.value = buttonVal;
            triggerEvent(parentDomNode, 'change');
        } else {
            // Otherwise, it's a link or some element with an .onClick method and we
            // can just click it. (Some sites have buttons that are triggered by a
            // mouseup, mousedown, etc. rather than a click, so we simulate all
            // relevant actions here.)
            var domNode = jQueryButton[0];
            triggerEvent(domNode, 'mouseover');
            triggerEvent(domNode, 'mousedown');
            triggerEvent(domNode, 'mouseup');
            // HACK(maia): don't ask me why, but triggerEvent('click') doesn't work on
            // some brands (cough Everlane cough). This seems to work, though.
            domNode.click();
        }
    }

    // trigger the specified event on the domNode
    function triggerEvent(domNode, eventType) {
        var evt = new Event(eventType, {'bubbles': true});
        domNode.dispatchEvent(evt);
    }

    // Scrape the current state of the page (so the current value of "price", "images",
    // etc., and any user-defined attributes) and return as a variant object.
    function scrapeCurrentVariant(variantFieldConfigs) {
        var scrapeId = phantom.onScrapeStarted({level: 'variant'});
        var variant = {};
        var errors = {};
        var attributeErrors = [];
        var hasErrors = false;
        var queryResult;

        for (var field in variantFieldConfigs) {
            var expectedType = trainingDataVariantFieldSchema[field];

            if (field === NAMED_ATTRIBUTES_KEY) {
                queryResult = [];
                var configArray = variantFieldConfigs[NAMED_ATTRIBUTES_KEY];

                // NOTE(maia): we store attribute name/val pairs (and also attribute
                // errors) in a slice in part to track the index (i) of the attribute so
                // that we can populate the correct field in the GUI with the result.
                // Note then that there may be empty attributes in the attribute/errors
                // maps as placeholders
                variant[NAMED_ATTRIBUTES_KEY] = [];

                for (var i = 0; i < configArray.length; i++) {
                    // These field names are only used for logging, so are arbitrary.
                    var attrNameField = "attr-" + i + "-name";
                    var attrValueField = "attr-" + i + "-value";

                    var attributeName = scrapeField(attrNameField,
                        configArray[i][ATTRIBUTE_NAME_KEY], expectedType);
                    var attributeValue = scrapeField(attrValueField,
                        configArray[i][ATTRIBUTE_VALUE_KEY], expectedType);

                    // If either name or value returned an error, attach to errors array
                    if ((attributeName.hasOwnProperty('error') ||
                        attributeValue.hasOwnProperty('error'))) {
                        attributeErrors[i] = {};
                        attributeErrors[i][ATTRIBUTE_NAME_KEY] = attributeName.error;
                        attributeErrors[i][ATTRIBUTE_VALUE_KEY] = attributeValue.error;
                    }

                    // If at least one of name and value scraped successfully, attach to results
                    if (!(attributeName.hasOwnProperty('error') &&
                        attributeValue.hasOwnProperty('error'))) {
                        variant[NAMED_ATTRIBUTES_KEY][i] = {};
                        variant[NAMED_ATTRIBUTES_KEY][i][ATTRIBUTE_NAME_KEY] = stringOrNull(attributeName);
                        variant[NAMED_ATTRIBUTES_KEY][i][ATTRIBUTE_VALUE_KEY] = stringOrNull(attributeValue);
                    }
                }
                if (attributeErrors.length > 0) {
                    errors[NAMED_ATTRIBUTES_KEY] = attributeErrors;
                    hasErrors = true;
                }

            } else {
                queryResult =
                    scrapeField(field, variantFieldConfigs[field], expectedType);
                fieldQueryResultToProductDataOrError(field, queryResult, variant, errors);
                hasErrors = hasErrors || queryResult.hasOwnProperty('error');
            }
        }

        if (hasErrors) {
            variant.errors = errors;
        }

        // If the quantity is provided via selector, convert it to number. If not,
        // assume in-stock & set quantity = 1000 (if we're trying to return an OoS
        // variant, this number will be changed in the outOfStockWorker).
        if (isNaN(Number(variant[QUANTITY_KEY]))) {
            variant[QUANTITY_KEY] = 1000;
        } else {
            variant[QUANTITY_KEY] = Number(variant[QUANTITY_KEY]);
        }
        // Pass variant attributes for logging purposes, so we can identify which
        // variant we were attempting to scrape.
        phantom.onScrapeFinished(scrapeId, variant[NAMED_ATTRIBUTES_KEY]);
        return variant;
    }

    // Given a jQuery object representing a button, try to get text representing
    // its value (but don't try too hard, since we can't make an exhaustive list
    // of all places where we might find this value).
    function getButtonTitle(button) {
        return trimIfExists(button.text()) || trimIfExists(button.attr('alt')) ||
            trimIfExists(button.attr('title')) || trimIfExists(button.attr('data-title')) ||
            trimIfExists(button.attr('aria-label')) ||
            trimIfExists(button.children().attr('alt')) ||
            trimIfExists(button.children().attr('title')) ||
            trimIfExists(button.children().attr('data-title')) ||
            trimIfExists(button.children().attr('aria-label')) ||
            '<name not found>';
    }

    // Logs prefixed message to the console.
    function log(msg, obj) {
        if (obj === undefined) {
            console.log('[BE] ' + msg);
        } else {
            console.log('[BE] ' + msg, obj);
        }
    }

    // Trim a string (unless it is null/undefined).
    function trimIfExists(str) {
        if (str) {
            return str.trim();
        } else {
            return str;
        }
    }

    // If input is of type 'string', returns the input; otherwise, returns null.
    function stringOrNull(x) { return typeof x == 'string' ? x : null; }

    function logStatAndDieWithMessage(statName, errorMsg) {
        if (!iframe) {
            // If running from server, log a stat.
            var statLogInfo = {
                'category': 'scraper_server',
                'name': statName,
                'value': 1
            };
            sendMessage('increment', statLogInfo);
        }

        var data = {'error': errorMsg};
        sendMessage('die', data);
    }

    window._springBookmarkletMain = main;

    window._springScrapePageForProduct = function (trainingData) {
        trainingData = ensureTrainingDataHasAllFieldConfigs(trainingData);
        scrapeWholeProduct(trainingData)
            .then(function(scraperResult) {
                var productData = scraperResult.productData;
                var products = [];
                products.push(productData);
                sendMessage('return_custom_json', products);
            })
            .fail(function(result) {
                // TODO(maia): handle this error properly. Or, like, at all.
                log('Failure in async function:', result);
            });
    };

    /* jshint ignore:start */
    (function(){function n(n){function r(r,t,e,u,i,o){for(;i>=0&&o>i;i+=n){var a=u?u[i]:i;e=t(e,r[a],a,r)}return e}return function(t,e,u,i){e=b(e,i,4);var o=!k(t)&&m.keys(t),a=(o||t).length,c=n>0?0:a-1;return arguments.length<3&&(u=t[o?o[c]:c],c+=n),r(t,e,u,o,c,a)}}function r(n){return function(r,t,e){t=x(t,e);for(var u=O(r),i=n>0?0:u-1;i>=0&&u>i;i+=n)if(t(r[i],i,r))return i;return-1}}function t(n,r,t){return function(e,u,i){var o=0,a=O(e);if("number"==typeof i)n>0?o=i>=0?i:Math.max(i+a,o):a=i>=0?Math.min(i+1,a):i+a+1;else if(t&&i&&a)return i=t(e,u),e[i]===u?i:-1;if(u!==u)return i=r(l.call(e,o,a),m.isNaN),i>=0?i+o:-1;for(i=n>0?o:a-1;i>=0&&a>i;i+=n)if(e[i]===u)return i;return-1}}function e(n,r){var t=I.length,e=n.constructor,u=m.isFunction(e)&&e.prototype||a,i="constructor";for(m.has(n,i)&&!m.contains(r,i)&&r.push(i);t--;)i=I[t],i in n&&n[i]!==u[i]&&!m.contains(r,i)&&r.push(i)}var u=this,i=u._,o=Array.prototype,a=Object.prototype,c=Function.prototype,f=o.push,l=o.slice,s=a.toString,p=a.hasOwnProperty,h=Array.isArray,v=Object.keys,g=c.bind,y=Object.create,d=function(){},m=function(n){return n instanceof m?n:this instanceof m?void(this._wrapped=n):new m(n)};"undefined"!=typeof exports?("undefined"!=typeof module&&module.exports&&(exports=module.exports=m),exports._=m):u._=m,m.VERSION="1.8.3";var b=function(n,r,t){if(void 0===r)return n;switch(null==t?3:t){case 1:return function(t){return n.call(r,t)};case 2:return function(t,e){return n.call(r,t,e)};case 3:return function(t,e,u){return n.call(r,t,e,u)};case 4:return function(t,e,u,i){return n.call(r,t,e,u,i)}}return function(){return n.apply(r,arguments)}},x=function(n,r,t){return null==n?m.identity:m.isFunction(n)?b(n,r,t):m.isObject(n)?m.matcher(n):m.property(n)};m.iteratee=function(n,r){return x(n,r,1/0)};var _=function(n,r){return function(t){var e=arguments.length;if(2>e||null==t)return t;for(var u=1;e>u;u++)for(var i=arguments[u],o=n(i),a=o.length,c=0;a>c;c++){var f=o[c];r&&void 0!==t[f]||(t[f]=i[f])}return t}},j=function(n){if(!m.isObject(n))return{};if(y)return y(n);d.prototype=n;var r=new d;return d.prototype=null,r},w=function(n){return function(r){return null==r?void 0:r[n]}},A=Math.pow(2,53)-1,O=w("length"),k=function(n){var r=O(n);return"number"==typeof r&&r>=0&&A>=r};m.each=m.forEach=function(n,r,t){r=b(r,t);var e,u;if(k(n))for(e=0,u=n.length;u>e;e++)r(n[e],e,n);else{var i=m.keys(n);for(e=0,u=i.length;u>e;e++)r(n[i[e]],i[e],n)}return n},m.map=m.collect=function(n,r,t){r=x(r,t);for(var e=!k(n)&&m.keys(n),u=(e||n).length,i=Array(u),o=0;u>o;o++){var a=e?e[o]:o;i[o]=r(n[a],a,n)}return i},m.reduce=m.foldl=m.inject=n(1),m.reduceRight=m.foldr=n(-1),m.find=m.detect=function(n,r,t){var e;return e=k(n)?m.findIndex(n,r,t):m.findKey(n,r,t),void 0!==e&&-1!==e?n[e]:void 0},m.filter=m.select=function(n,r,t){var e=[];return r=x(r,t),m.each(n,function(n,t,u){r(n,t,u)&&e.push(n)}),e},m.reject=function(n,r,t){return m.filter(n,m.negate(x(r)),t)},m.every=m.all=function(n,r,t){r=x(r,t);for(var e=!k(n)&&m.keys(n),u=(e||n).length,i=0;u>i;i++){var o=e?e[i]:i;if(!r(n[o],o,n))return!1}return!0},m.some=m.any=function(n,r,t){r=x(r,t);for(var e=!k(n)&&m.keys(n),u=(e||n).length,i=0;u>i;i++){var o=e?e[i]:i;if(r(n[o],o,n))return!0}return!1},m.contains=m.includes=m.include=function(n,r,t,e){return k(n)||(n=m.values(n)),("number"!=typeof t||e)&&(t=0),m.indexOf(n,r,t)>=0},m.invoke=function(n,r){var t=l.call(arguments,2),e=m.isFunction(r);return m.map(n,function(n){var u=e?r:n[r];return null==u?u:u.apply(n,t)})},m.pluck=function(n,r){return m.map(n,m.property(r))},m.where=function(n,r){return m.filter(n,m.matcher(r))},m.findWhere=function(n,r){return m.find(n,m.matcher(r))},m.max=function(n,r,t){var e,u,i=-1/0,o=-1/0;if(null==r&&null!=n){n=k(n)?n:m.values(n);for(var a=0,c=n.length;c>a;a++)e=n[a],e>i&&(i=e)}else r=x(r,t),m.each(n,function(n,t,e){u=r(n,t,e),(u>o||u===-1/0&&i===-1/0)&&(i=n,o=u)});return i},m.min=function(n,r,t){var e,u,i=1/0,o=1/0;if(null==r&&null!=n){n=k(n)?n:m.values(n);for(var a=0,c=n.length;c>a;a++)e=n[a],i>e&&(i=e)}else r=x(r,t),m.each(n,function(n,t,e){u=r(n,t,e),(o>u||1/0===u&&1/0===i)&&(i=n,o=u)});return i},m.shuffle=function(n){for(var r,t=k(n)?n:m.values(n),e=t.length,u=Array(e),i=0;e>i;i++)r=m.random(0,i),r!==i&&(u[i]=u[r]),u[r]=t[i];return u},m.sample=function(n,r,t){return null==r||t?(k(n)||(n=m.values(n)),n[m.random(n.length-1)]):m.shuffle(n).slice(0,Math.max(0,r))},m.sortBy=function(n,r,t){return r=x(r,t),m.pluck(m.map(n,function(n,t,e){return{value:n,index:t,criteria:r(n,t,e)}}).sort(function(n,r){var t=n.criteria,e=r.criteria;if(t!==e){if(t>e||void 0===t)return 1;if(e>t||void 0===e)return-1}return n.index-r.index}),"value")};var F=function(n){return function(r,t,e){var u={};return t=x(t,e),m.each(r,function(e,i){var o=t(e,i,r);n(u,e,o)}),u}};m.groupBy=F(function(n,r,t){m.has(n,t)?n[t].push(r):n[t]=[r]}),m.indexBy=F(function(n,r,t){n[t]=r}),m.countBy=F(function(n,r,t){m.has(n,t)?n[t]++:n[t]=1}),m.toArray=function(n){return n?m.isArray(n)?l.call(n):k(n)?m.map(n,m.identity):m.values(n):[]},m.size=function(n){return null==n?0:k(n)?n.length:m.keys(n).length},m.partition=function(n,r,t){r=x(r,t);var e=[],u=[];return m.each(n,function(n,t,i){(r(n,t,i)?e:u).push(n)}),[e,u]},m.first=m.head=m.take=function(n,r,t){return null==n?void 0:null==r||t?n[0]:m.initial(n,n.length-r)},m.initial=function(n,r,t){return l.call(n,0,Math.max(0,n.length-(null==r||t?1:r)))},m.last=function(n,r,t){return null==n?void 0:null==r||t?n[n.length-1]:m.rest(n,Math.max(0,n.length-r))},m.rest=m.tail=m.drop=function(n,r,t){return l.call(n,null==r||t?1:r)},m.compact=function(n){return m.filter(n,m.identity)};var S=function(n,r,t,e){for(var u=[],i=0,o=e||0,a=O(n);a>o;o++){var c=n[o];if(k(c)&&(m.isArray(c)||m.isArguments(c))){r||(c=S(c,r,t));var f=0,l=c.length;for(u.length+=l;l>f;)u[i++]=c[f++]}else t||(u[i++]=c)}return u};m.flatten=function(n,r){return S(n,r,!1)},m.without=function(n){return m.difference(n,l.call(arguments,1))},m.uniq=m.unique=function(n,r,t,e){m.isBoolean(r)||(e=t,t=r,r=!1),null!=t&&(t=x(t,e));for(var u=[],i=[],o=0,a=O(n);a>o;o++){var c=n[o],f=t?t(c,o,n):c;r?(o&&i===f||u.push(c),i=f):t?m.contains(i,f)||(i.push(f),u.push(c)):m.contains(u,c)||u.push(c)}return u},m.union=function(){return m.uniq(S(arguments,!0,!0))},m.intersection=function(n){for(var r=[],t=arguments.length,e=0,u=O(n);u>e;e++){var i=n[e];if(!m.contains(r,i)){for(var o=1;t>o&&m.contains(arguments[o],i);o++);o===t&&r.push(i)}}return r},m.difference=function(n){var r=S(arguments,!0,!0,1);return m.filter(n,function(n){return!m.contains(r,n)})},m.zip=function(){return m.unzip(arguments)},m.unzip=function(n){for(var r=n&&m.max(n,O).length||0,t=Array(r),e=0;r>e;e++)t[e]=m.pluck(n,e);return t},m.object=function(n,r){for(var t={},e=0,u=O(n);u>e;e++)r?t[n[e]]=r[e]:t[n[e][0]]=n[e][1];return t},m.findIndex=r(1),m.findLastIndex=r(-1),m.sortedIndex=function(n,r,t,e){t=x(t,e,1);for(var u=t(r),i=0,o=O(n);o>i;){var a=Math.floor((i+o)/2);t(n[a])<u?i=a+1:o=a}return i},m.indexOf=t(1,m.findIndex,m.sortedIndex),m.lastIndexOf=t(-1,m.findLastIndex),m.range=function(n,r,t){null==r&&(r=n||0,n=0),t=t||1;for(var e=Math.max(Math.ceil((r-n)/t),0),u=Array(e),i=0;e>i;i++,n+=t)u[i]=n;return u};var E=function(n,r,t,e,u){if(!(e instanceof r))return n.apply(t,u);var i=j(n.prototype),o=n.apply(i,u);return m.isObject(o)?o:i};m.bind=function(n,r){if(g&&n.bind===g)return g.apply(n,l.call(arguments,1));if(!m.isFunction(n))throw new TypeError("Bind must be called on a function");var t=l.call(arguments,2),e=function(){return E(n,e,r,this,t.concat(l.call(arguments)))};return e},m.partial=function(n){var r=l.call(arguments,1),t=function(){for(var e=0,u=r.length,i=Array(u),o=0;u>o;o++)i[o]=r[o]===m?arguments[e++]:r[o];for(;e<arguments.length;)i.push(arguments[e++]);return E(n,t,this,this,i)};return t},m.bindAll=function(n){var r,t,e=arguments.length;if(1>=e)throw new Error("bindAll must be passed function names");for(r=1;e>r;r++)t=arguments[r],n[t]=m.bind(n[t],n);return n},m.memoize=function(n,r){var t=function(e){var u=t.cache,i=""+(r?r.apply(this,arguments):e);return m.has(u,i)||(u[i]=n.apply(this,arguments)),u[i]};return t.cache={},t},m.delay=function(n,r){var t=l.call(arguments,2);return setTimeout(function(){return n.apply(null,t)},r)},m.defer=m.partial(m.delay,m,1),m.throttle=function(n,r,t){var e,u,i,o=null,a=0;t||(t={});var c=function(){a=t.leading===!1?0:m.now(),o=null,i=n.apply(e,u),o||(e=u=null)};return function(){var f=m.now();a||t.leading!==!1||(a=f);var l=r-(f-a);return e=this,u=arguments,0>=l||l>r?(o&&(clearTimeout(o),o=null),a=f,i=n.apply(e,u),o||(e=u=null)):o||t.trailing===!1||(o=setTimeout(c,l)),i}},m.debounce=function(n,r,t){var e,u,i,o,a,c=function(){var f=m.now()-o;r>f&&f>=0?e=setTimeout(c,r-f):(e=null,t||(a=n.apply(i,u),e||(i=u=null)))};return function(){i=this,u=arguments,o=m.now();var f=t&&!e;return e||(e=setTimeout(c,r)),f&&(a=n.apply(i,u),i=u=null),a}},m.wrap=function(n,r){return m.partial(r,n)},m.negate=function(n){return function(){return!n.apply(this,arguments)}},m.compose=function(){var n=arguments,r=n.length-1;return function(){for(var t=r,e=n[r].apply(this,arguments);t--;)e=n[t].call(this,e);return e}},m.after=function(n,r){return function(){return--n<1?r.apply(this,arguments):void 0}},m.before=function(n,r){var t;return function(){return--n>0&&(t=r.apply(this,arguments)),1>=n&&(r=null),t}},m.once=m.partial(m.before,2);var M=!{toString:null}.propertyIsEnumerable("toString"),I=["valueOf","isPrototypeOf","toString","propertyIsEnumerable","hasOwnProperty","toLocaleString"];m.keys=function(n){if(!m.isObject(n))return[];if(v)return v(n);var r=[];for(var t in n)m.has(n,t)&&r.push(t);return M&&e(n,r),r},m.allKeys=function(n){if(!m.isObject(n))return[];var r=[];for(var t in n)r.push(t);return M&&e(n,r),r},m.values=function(n){for(var r=m.keys(n),t=r.length,e=Array(t),u=0;t>u;u++)e[u]=n[r[u]];return e},m.mapObject=function(n,r,t){r=x(r,t);for(var e,u=m.keys(n),i=u.length,o={},a=0;i>a;a++)e=u[a],o[e]=r(n[e],e,n);return o},m.pairs=function(n){for(var r=m.keys(n),t=r.length,e=Array(t),u=0;t>u;u++)e[u]=[r[u],n[r[u]]];return e},m.invert=function(n){for(var r={},t=m.keys(n),e=0,u=t.length;u>e;e++)r[n[t[e]]]=t[e];return r},m.functions=m.methods=function(n){var r=[];for(var t in n)m.isFunction(n[t])&&r.push(t);return r.sort()},m.extend=_(m.allKeys),m.extendOwn=m.assign=_(m.keys),m.findKey=function(n,r,t){r=x(r,t);for(var e,u=m.keys(n),i=0,o=u.length;o>i;i++)if(e=u[i],r(n[e],e,n))return e},m.pick=function(n,r,t){var e,u,i={},o=n;if(null==o)return i;m.isFunction(r)?(u=m.allKeys(o),e=b(r,t)):(u=S(arguments,!1,!1,1),e=function(n,r,t){return r in t},o=Object(o));for(var a=0,c=u.length;c>a;a++){var f=u[a],l=o[f];e(l,f,o)&&(i[f]=l)}return i},m.omit=function(n,r,t){if(m.isFunction(r))r=m.negate(r);else{var e=m.map(S(arguments,!1,!1,1),String);r=function(n,r){return!m.contains(e,r)}}return m.pick(n,r,t)},m.defaults=_(m.allKeys,!0),m.create=function(n,r){var t=j(n);return r&&m.extendOwn(t,r),t},m.clone=function(n){return m.isObject(n)?m.isArray(n)?n.slice():m.extend({},n):n},m.tap=function(n,r){return r(n),n},m.isMatch=function(n,r){var t=m.keys(r),e=t.length;if(null==n)return!e;for(var u=Object(n),i=0;e>i;i++){var o=t[i];if(r[o]!==u[o]||!(o in u))return!1}return!0};var N=function(n,r,t,e){if(n===r)return 0!==n||1/n===1/r;if(null==n||null==r)return n===r;n instanceof m&&(n=n._wrapped),r instanceof m&&(r=r._wrapped);var u=s.call(n);if(u!==s.call(r))return!1;switch(u){case"[object RegExp]":case"[object String]":return""+n==""+r;case"[object Number]":return+n!==+n?+r!==+r:0===+n?1/+n===1/r:+n===+r;case"[object Date]":case"[object Boolean]":return+n===+r}var i="[object Array]"===u;if(!i){if("object"!=typeof n||"object"!=typeof r)return!1;var o=n.constructor,a=r.constructor;if(o!==a&&!(m.isFunction(o)&&o instanceof o&&m.isFunction(a)&&a instanceof a)&&"constructor"in n&&"constructor"in r)return!1}t=t||[],e=e||[];for(var c=t.length;c--;)if(t[c]===n)return e[c]===r;if(t.push(n),e.push(r),i){if(c=n.length,c!==r.length)return!1;for(;c--;)if(!N(n[c],r[c],t,e))return!1}else{var f,l=m.keys(n);if(c=l.length,m.keys(r).length!==c)return!1;for(;c--;)if(f=l[c],!m.has(r,f)||!N(n[f],r[f],t,e))return!1}return t.pop(),e.pop(),!0};m.isEqual=function(n,r){return N(n,r)},m.isEmpty=function(n){return null==n?!0:k(n)&&(m.isArray(n)||m.isString(n)||m.isArguments(n))?0===n.length:0===m.keys(n).length},m.isElement=function(n){return!(!n||1!==n.nodeType)},m.isArray=h||function(n){return"[object Array]"===s.call(n)},m.isObject=function(n){var r=typeof n;return"function"===r||"object"===r&&!!n},m.each(["Arguments","Function","String","Number","Date","RegExp","Error"],function(n){m["is"+n]=function(r){return s.call(r)==="[object "+n+"]"}}),m.isArguments(arguments)||(m.isArguments=function(n){return m.has(n,"callee")}),"function"!=typeof/./&&"object"!=typeof Int8Array&&(m.isFunction=function(n){return"function"==typeof n||!1}),m.isFinite=function(n){return isFinite(n)&&!isNaN(parseFloat(n))},m.isNaN=function(n){return m.isNumber(n)&&n!==+n},m.isBoolean=function(n){return n===!0||n===!1||"[object Boolean]"===s.call(n)},m.isNull=function(n){return null===n},m.isUndefined=function(n){return void 0===n},m.has=function(n,r){return null!=n&&p.call(n,r)},m.noConflict=function(){return u._=i,this},m.identity=function(n){return n},m.constant=function(n){return function(){return n}},m.noop=function(){},m.property=w,m.propertyOf=function(n){return null==n?function(){}:function(r){return n[r]}},m.matcher=m.matches=function(n){return n=m.extendOwn({},n),function(r){return m.isMatch(r,n)}},m.times=function(n,r,t){var e=Array(Math.max(0,n));r=b(r,t,1);for(var u=0;n>u;u++)e[u]=r(u);return e},m.random=function(n,r){return null==r&&(r=n,n=0),n+Math.floor(Math.random()*(r-n+1))},m.now=Date.now||function(){return(new Date).getTime()};var B={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"},T=m.invert(B),R=function(n){var r=function(r){return n[r]},t="(?:"+m.keys(n).join("|")+")",e=RegExp(t),u=RegExp(t,"g");return function(n){return n=null==n?"":""+n,e.test(n)?n.replace(u,r):n}};m.escape=R(B),m.unescape=R(T),m.result=function(n,r,t){var e=null==n?void 0:n[r];return void 0===e&&(e=t),m.isFunction(e)?e.call(n):e};var q=0;m.uniqueId=function(n){var r=++q+"";return n?n+r:r},m.templateSettings={evaluate:/<%([\s\S]+?)%>/g,interpolate:/<%=([\s\S]+?)%>/g,escape:/<%-([\s\S]+?)%>/g};var K=/(.)^/,z={"'":"'","\\":"\\","\r":"r","\n":"n","\u2028":"u2028","\u2029":"u2029"},D=/\\|'|\r|\n|\u2028|\u2029/g,L=function(n){return"\\"+z[n]};m.template=function(n,r,t){!r&&t&&(r=t),r=m.defaults({},r,m.templateSettings);var e=RegExp([(r.escape||K).source,(r.interpolate||K).source,(r.evaluate||K).source].join("|")+"|$","g"),u=0,i="__p+='";n.replace(e,function(r,t,e,o,a){return i+=n.slice(u,a).replace(D,L),u=a+r.length,t?i+="'+\n((__t=("+t+"))==null?'':_.escape(__t))+\n'":e?i+="'+\n((__t=("+e+"))==null?'':__t)+\n'":o&&(i+="';\n"+o+"\n__p+='"),r}),i+="';\n",r.variable||(i="with(obj||{}){\n"+i+"}\n"),i="var __t,__p='',__j=Array.prototype.join,print=function(){__p+=__j.call(arguments,'');};\n"+i+"return __p;\n";try{var o=new Function(r.variable||"obj","_",i)}catch(a){throw a.source=i,a}var c=function(n){return o.call(this,n,m)},f=r.variable||"obj";return c.source="function("+f+"){\n"+i+"}",c},m.chain=function(n){var r=m(n);return r._chain=!0,r};var P=function(n,r){return n._chain?m(r).chain():r};m.mixin=function(n){m.each(m.functions(n),function(r){var t=m[r]=n[r];m.prototype[r]=function(){var n=[this._wrapped];return f.apply(n,arguments),P(this,t.apply(m,n))}})},m.mixin(m),m.each(["pop","push","reverse","shift","sort","splice","unshift"],function(n){var r=o[n];m.prototype[n]=function(){var t=this._wrapped;return r.apply(t,arguments),"shift"!==n&&"splice"!==n||0!==t.length||delete t[0],P(this,t)}}),m.each(["concat","join","slice"],function(n){var r=o[n];m.prototype[n]=function(){return P(this,r.apply(this._wrapped,arguments))}}),m.prototype.value=function(){return this._wrapped},m.prototype.valueOf=m.prototype.toJSON=m.prototype.value,m.prototype.toString=function(){return""+this._wrapped},"function"==typeof define&&define.amd&&define("underscore",[],function(){return m})}).call(window);
    /* jshint ignore:end */
    _ = window._.noConflict();

    init();

})(window._springBookmarkletJquery);
