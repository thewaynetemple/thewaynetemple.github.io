(function ($) {

    'use strict';

    var customField = {
        name: '',
        type: '', // 'js' or 'css'
        css_selector: '',
        attribute: '',
        snippet: ''
    };

    var selector = {
        type: '', // {'js', 'css', 'text'}
        text: '',
        snippet: '',
        substitution: [],
        css_selector: '',
        attribute: ''
    };

    // GUI specific constants.
    const ATTRIBUTE_FIELD_PREFIX = 'attribute-field-';
    const ATTRIBUTE_NAME_SUFFIX = '-name';
    const ATTRIBUTE_VALUE_SUFFIX = '-value';
    // TODO(maia): const ATTRIBUTE_FIELD_SUFFIXES = [ATTRIBUTE_NAME_SUFFIX, ATTRIBUTE_VALUE_SUFFIX];
    const ATTRIBUTE_FIELD_SUFFIXES = [ATTRIBUTE_VALUE_SUFFIX];

    const VARIANT_DIMENSION_BUTTON_PREFIX = 'variant-button-';
    const ACTIVE_BUTTONS_ID_SUFIX = '-active-buttons';
    const INACTIVE_BUTTONS_ID_SUFIX = '-inactive-buttons';
    const ALL_BUTTON_VALUES_ID_SUFIX = '-all-button-values';
    const VARIANT_DIMENSION_BUTTON_SUFFIXES = [ACTIVE_BUTTONS_ID_SUFIX,
        INACTIVE_BUTTONS_ID_SUFIX, ALL_BUTTON_VALUES_ID_SUFIX];

    var topDomain;
    // TODO(joanna): Those most probably should not be kept here. Figure out how
    // to structure it all better.
    var errorModal = $('#error-modal');
    var errorModalMsg = $('#error-modal-msg');
    var jsEditor = ace.edit('editor');

    var defaultJSSnippetForStringField =
        "// This function (fn) must return a single string.\n" +
        "// Use $ for jQuery\n\nvar fn = function(){\n    return '';\n};{fn}";
    var defaultJSSnippetForArrayField =
        "// This function (fn) must return an ARRAY of strings.\n" +
        "// Use $ for jQuery\n\nvar fn = function(){\n    return ['', ''];\n};{fn}";
    var defaultJSSnippetForJQueryField =
        "// This function (fn) must return a jQuery object.\n" +
        "// Use $ for jQuery\n\nvar fn = function(){\n    return '';\n};{fn}";
    var defaultJSSnippetForBoolField =
        "// This function (fn) must return a boolean.\n" +
        "// Return 'true' if this page is a scrapable product,\n// return 'false' otherwise.\n" +
        "// Use $ for jQuery\n\nvar fn = function(){\n    return false;\n};{fn}";
    // NOTE(maia): ^ this boilerplate is specific to the 'IsProduct' field and
    // will need to change if we ever have another bool field

    // Indicates the state of the UI. Currently supports
    // UI status values:
    // - displaying (showing some data and/or errors)
    // - scraping (executing query over the current page
    // scrape mode values:
    // - single (scraping just the currently visible variant)
    /// - all (scraping all the variants on the current product page)
    var UI_STATUS_DISPLAYING = 'displaying';
    var UI_STATUS_SCRAPING = 'scraping';
    var SCRAPE_MODE_SINGLE_VARIANT = 'single';
    var SCRAPE_MODE_ALL_VARIANTS = 'all';
    var uiState = {
        status: UI_STATUS_DISPLAYING,
        scrapeMode: SCRAPE_MODE_SINGLE_VARIANT
    };

    // Initialize
    function init() {
        addEvent(window, 'message', onMessage, false);
        addEventListeners();
        window.topDomain = topDomain = qString().domain;
        loadTrainingData();
    }

    function qString(url) {
        url = url || location.href;
        var params = {};
        var q = url.split('?')[1] || '';
        var qArray = q.split('&');
        var pair;
        var key;
        var val;
        for (var i = 0, len = qArray.length; i < len; i++) {
            pair = qArray[i].split('=');
            key = decodeURIComponent(pair[0]);
            val = decodeURIComponent(pair[1]);
            if (params.hasOwnProperty(key)) {
                if (typeof params[key] === 'string') {
                    params[key] = [params[key]];
                }
                params[key].push(val);
            } else {
                params[key] = val;
            }
        }
        return params;
    }

    var uiStateChangeCallback = function(target, property, value) {
        if (property === "status" && value === UI_STATUS_SCRAPING) {
            $('#product-data').addClass('scraping');
        } else {
            $('#product-data').removeClass('scraping');
        }
        return (target[property] = value);
    };

    // Add Events to Page
    function addEvent(obj, type, fn) {
        return obj.attachEvent ?
            obj.attachEvent('on', type, fn) : obj.addEventListener(type, fn, false);
    }

    function addEventListeners() {
        var editFieldButtons = $('.input-modal-trigger');
        var fieldName = $('.field-name-container');
        var updateButtons = $('.update-selector');
        var addRegexField = $('.add-regex a');
        var useJsSnippetButton = $('.field-type-selector.selector-type-js');
        var useCssSelectorButton = $('.field-type-selector.selector-type-css');
        var useHardcodedTextButton = $('.field-type-selector.selector-type-text');
        var addVariantDimensionButton = $('#add-variant-dimension-button');
        var addFieldAttrbuteButton = $('#add-field-attribute-button');
        var validateButton = $('#validate');
        var scrapeCurrentPageButton = $('#scrape-current');
        var scrapeAndShowVariantsButton = $('#scrape-whole');

        // Field specific handlers.
        editFieldButtons.on('click', showOrHideEditFieldModal);
        fieldName.on('click', showOrHideEditFieldModal);
        updateButtons.on('click', update);
        addRegexField.on('click', addAnotherSetOfRegexInputs);
        useJsSnippetButton.on('click', openEditor);
        useCssSelectorButton.on('click', useCssSelector);

        // UI-generic handlers.
        addVariantDimensionButton.on('click', onAddVariantDimensionButtonClicked);
        addFieldAttrbuteButton.on('click', onAddAttributeFieldClicked);
        validateButton.on('click', validateTrainingData);
        scrapeCurrentPageButton.on('click', onScrapePage);
        scrapeAndShowVariantsButton.on('click', onScrapeAndShowVariants);

        setUpJsEditor();
        // Message modal-related events
        $('html').on('click', handleClickOut);
        errorModal.on('click', hideErrorModal);
        // Hide popups contents.
        $('#validation-dialog .contents').hide();

        uiState = new Proxy(uiState, {set: uiStateChangeCallback});
    }

    function setUpJsEditor() {
        jsEditor.setTheme('ace/theme/monokai');
        jsEditor.getSession().setMode('ace/mode/javascript');
        jsEditor.on('dialogbeforeclose', saveEditorContents);
        $('#editor').hide();
    }

    function openEditor(e) {
        e.stopPropagation();
        var field = getFieldNameFromEvent(e);
        var fieldType = getFieldType(field);
        var trainingDataField = getFieldConfig(field);

        // Save the field name.
        $('#js-field-name').html(field);

        if(trainingDataField.snippet !== undefined) {
            jsEditor.setValue(trainingDataField.snippet);
        } else if ( fieldType === 'bool' ){
            jsEditor.setValue(defaultJSSnippetForBoolField);
        } else if ( fieldType === 'string' ){
            jsEditor.setValue(defaultJSSnippetForStringField);
        } else if ( fieldType === 'jQuery' ){
            jsEditor.setValue(defaultJSSnippetForJQueryField);
        } else {
            jsEditor.setValue(defaultJSSnippetForArrayField);
        }

        // User-provided attribute name for variant field or button.
        var attributeId;
        if (isVariantDimensionButtonField(field) || isAttributeField(field)) {
            attributeId = getAttributeIdForField(field);
        }

        var displayName = attributeId ? attributeId : field;
        var editorTitle = '[' + displayName + '] selector' ;
        $('#' + field + ' .css-selector').hide();
        $('#editor').show();
        $('#js-editor-dialog').dialog({
            close: saveEditorContents,
            title: editorTitle,
            width: 500
        });
    }

    function saveEditorContents() {
        $('#editor').hide();
        var field = $('#js-field-name').html();
        getFieldConfig(field).type = 'js';
        setSaveAndQuery(field, jsEditor.getValue());
        log('Saving editor contents');
    }

    function onCloseEditor(e) {
        log('onCloseEditor');
        e.preventDefault();
        e.stopPropagation();
        $('#js-editor-dialog').dialog('close');
    }

    function handleClickOut(e) {
        var clickedInOpenedModal = !(e.target.closest('.input-modal'));
        if (clickedInOpenedModal) {
            hideErrorModal();
            // TODO(joanna): Fix. For now if you click in other modal this is not
            // triggered, but should be.
            $('.input-modal').slideUp();
            $('button.input-modal-trigger').text('►');
        }
    }

    function useCssSelector(e) {
        e.stopPropagation();
        onUpdateCssSelectorState(e);
        var field = getFieldNameFromEvent(e);
        var fieldConfig = getFieldConfig(field);
        fieldConfig.type = 'css';
        $('#' + field + ' .css-selector').show();
    }

    function addAnotherSetOfRegexInputs(e) {
        e.preventDefault();
        e.stopPropagation();
        var regexList = $(e.target).closest('.regex-list').eq(0);
        insertAnotherRegexFieldSet(regexList);
    }

    function getFieldNameFromEvent(e) {
        return $(e.target).closest('.field-wrapper').attr('id');
    }

    function getWrapperIdForSubfield(subfield) {
        var prefix;
        if (isVariantDimensionButtonField(subfield)) {
            prefix = VARIANT_DIMENSION_BUTTON_PREFIX;
        } else if (isAttributeField(subfield)) {
            prefix = ATTRIBUTE_FIELD_PREFIX;
        } else {
            // We should never call this function on a non-dimension-button, non-
            // attribute field: something is wrong.
            log('UNEXPECTED BEHAVIOR! Called "getWrapperIdForSubfield" on a field that was neither a dimension ' +
                'button field nor an attribute field: ' + subfield);
            return subfield;
        }

        // If last character of the field name is a digit...
        if (/^\d+$/.test(subfield.slice(subfield.length-1))) {
            // ...it's a top level field, no modification to the ID is needed.
            return subfield;
        }
        return subfield.substr(
            0, subfield.indexOf('-', prefix.length));
    }

    // Given a dimension button or attribute subfield (or field), returns the
    // top-level config(e.g. for a button, this will consist of fieldconfigs for
    // in-stock buttons, OOS buttons, all_values, etc.). If field passed is not
    // a button or attribute field/subfield, returns null.
    function getTopLevelConfig(field) {
        var wrapperFieldId = getWrapperIdForSubfield(field);
        if (!!wrapperFieldId) {
            return getFieldConfig(wrapperFieldId);
        }
        return null;
    }

    // Returns the contents of the "attribute-id" text field associated with the
    // given field/subfield. (E.g. if you pass an "inactive-button-values"
    // subfield, it will return the contents of the "attribute-id" field
    // associated with this button config.)
    function getAttributeIdForField(field) {
        var wrapperField = getWrapperIdForSubfield(field);
        return $('#' + wrapperField + ' .attribute-id').val();
    }

    function setSaveAndQuery(field, snippet) {
        var wrapperField;
        var trainingDataField;
        // Update training data depending on the field type.
        if (isVariantDimensionButtonField(field)) {
            if (!!snippet) {
                setFieldConfigFromUserInput(field, snippet);
            }

            // And now save the whole button.
            wrapperField = getWrapperIdForSubfield(field);
            trainingDataField = getFieldConfig(wrapperField);
            trainingDataField[ATTRIBUTE_ID_KEY] = getAttributeIdForField(field);
            setFieldConfigFromUserInput(wrapperField + ACTIVE_BUTTONS_ID_SUFIX);
            setFieldConfigFromUserInput(wrapperField + INACTIVE_BUTTONS_ID_SUFIX);
            setFieldConfigFromUserInput(wrapperField + ALL_BUTTON_VALUES_ID_SUFIX);
        } else if (isAttributeField(field)) {
            if (!!snippet) {
                setFieldConfigFromUserInput(field, snippet);
            }

            // Save the whole attribute config.
            wrapperField = getWrapperIdForSubfield(field);
            trainingDataField = getFieldConfig(wrapperField);
            trainingDataField[ATTRIBUTE_ID_KEY] = getAttributeIdForField(field);

            // HACK(maia): uncomment line below when we have gui support for new attr schema:
            // setFieldConfigFromUserInput(wrapperField + ATTRIBUTE_NAME_SUFFIX);
            trainingDataField[ATTRIBUTE_NAME_KEY].type = 'text';
            trainingDataField[ATTRIBUTE_NAME_KEY].text = $('#' + wrapperField + ' .attribute-id').val();

            setFieldConfigFromUserInput(wrapperField + ATTRIBUTE_VALUE_SUFFIX);
        } else {
            setFieldConfigFromUserInput(field, snippet);
        }

        // Save updated training data.
        saveTrainingData();
        scrapeCurrentPage();
    }

    function update(e) {
        e.preventDefault();
        e.stopPropagation();
        var field = getFieldNameFromEvent(e);
        setSaveAndQuery(field);
    }

    // Process Training Data from the Server
    function loadTrainingData() {
        var encodedUrl = encodeURIComponent(topDomain);
        $.ajax({
            url: '/api/1/training?url=' + encodedUrl,
            success: function (data) {
                if (data && data.data) {
                    var trainingDataContainer = JSON.parse(data.data);
                    if (trainingDataContainer && trainingDataContainer.version) {
                        if (trainingDataContainer.version === 2) {
                            alert(
                                'Got version 2 of training data which is not supported by this UI.' +
                                'Please clean the DB, and use this data to re-train the brand:',
                                trainingDataContainer.trainingData);
                            return;
                        } else if (trainingDataContainer.version === 3) {
                            // Set global variable 'trainingData'.
                            trainingData = ensureTrainingDataHasAllFieldConfigs(trainingDataContainer.trainingData);
                        } else {
                            log('Unsupported training data version or malformed training data container.');
                        }
                    }
                    log('Training data from the server (with any missing fields added): ', trainingData);
                }
                loadScripts();
            }
        });
    }

    function showTrainingData() {
        var i;
        for (i = 0; i < configFieldNames.length; i++) {
            var field = configFieldNames[i];
            var fieldConfig = getFieldConfig(field);
            if (!fieldConfig) {
                log('Could not load fieldConfig for field:', field);
                continue;
            }

            showTrainingDataSelectors(field, fieldConfig);
        }

        var attributes = trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY];
        for (i = 0; i < attributes.length; i++) {
            createAttributeElementAndShowTrainingData(attributes[i]);
        }

        var buttons = trainingData[VARIANT_DIMENSION_BUTTONS_KEY];
        for (i = 0; i < buttons.length; i++) {
            createButtonElementAndShowTrainingData(buttons[i]);
        }
    }

    function createAttributeElementAndShowTrainingData(attrConfig) {
        // Get index for the new element we're creating.
        var newAttrIndex = getNextAttributeFieldId();
        var newAttrFieldId = ATTRIBUTE_FIELD_PREFIX + newAttrIndex;

        // Insert into DOM.
        insertAttributeSelectorInDomAtIndex(newAttrIndex);

        // Update attribute name.
        var $attributeName = $('#' + newAttrFieldId + ' .attribute-id');

        // TODO(maia): actual display of attr name training data, if any (just
        // displaying hardcoded attr id for now to preserve current behavior)
        $attributeName.val(attrConfig[ATTRIBUTE_ID_KEY]);
        // And trigger propagation of it.
        $attributeName.trigger('change');
        // Load the rest of the data.
        // TODO(maia): load for name and value configs!
        showTrainingDataSelectors(newAttrFieldId, attrConfig);
    }

    function createButtonElementAndShowTrainingData(buttonConfig) {
        // Get index for the new element we're creating.
        var newButtonIndex = getNextVariantDimensionButtonId();
        var newButtonFieldId = VARIANT_DIMENSION_BUTTON_PREFIX + newButtonIndex;

        // Insert into DOM.
        insertVariantDimensionButtonSelectorInDomAtIndex(newButtonIndex);

        // Update attribute name.
        var $attributeName = $('#' + newButtonFieldId + ' .attribute-id');
        $attributeName.val(buttonConfig[ATTRIBUTE_ID_KEY]);

        // And trigger propagation of it.
        $attributeName.trigger('change');

        // Load the rest of the data.
        showTrainingDataSelectors(
            newButtonFieldId + ACTIVE_BUTTONS_ID_SUFIX,
            buttonConfig[ACTIVE_BUTTONS_KEY]);
        showTrainingDataSelectors(
            newButtonFieldId + INACTIVE_BUTTONS_ID_SUFIX,
            buttonConfig[INACTIVE_BUTTON_VALUES_KEY]);
        showTrainingDataSelectors(
            newButtonFieldId + ALL_BUTTON_VALUES_ID_SUFIX,
            buttonConfig[ALL_BUTTON_VALUES_KEY]);
    }

    function showTrainingDataSelectors(field, fieldConfig) {
        // HACK(maia): fix when adding gui support for new attr schema
        if (isAttributeField(field)) {
            fieldConfig = fieldConfig[ATTRIBUTE_VALUE_KEY];
        }

        if (fieldConfig) {
            if (fieldConfig.type === 'js') {
                $('#' + field + ' .field-type-selector.selector-type-css')
                    .removeAttr('checked');
                $('#' + field + ' input.field-type-selector.selector-type-js')
                    .attr('checked', true);
                // Don't show CSS selector if current type is 'js'
                $('#' + field + ' .css-selector').hide();
            } else {
                $('#' + field + ' .field-type-selector.selector-type-js')
                    .removeAttr('checked');
                $('#' + field + ' input.field-type-selector.selector-type-css')
                    .attr('checked', true);
            }
            // Regardless of whether the CSS is now selected or not - load the value
            // of the selector saved in training_data.
            $('#' + field + ' .selector').val(fieldConfig.cssSelector);

            // Display the regex 'from' and 'to' values.
            if (fieldConfig.hasOwnProperty('substitution')) {
                showTrainingDataSubstitutions(field, fieldConfig);
            }

            if (fieldConfig.hasOwnProperty('attribute')) {
                showTrainingDataAttribute(field, fieldConfig);
            }
        }
    }

    function showTrainingDataAttribute(field, fieldConfig) {
        $('#' + field + ' .attribute').val(fieldConfig.attribute);
    }

    function showTrainingDataSubstitutions(field, fieldConfig) {
        var regexList = $('#' + field + ' .regex-list');
        for (var j = 0; j < fieldConfig.substitution.length; j++) {
            if (j > 0) {
                insertAnotherRegexFieldSet(regexList);
            }
            var regexListItem = $('#' + field + ' .regex-list li');
            var regexPair = fieldConfig.substitution[j];
            var regexFrom = regexPair.to_find || '';
            var regexTo = regexPair.to_replace || '';

            $(regexListItem[j]).find('.regex-from').val(regexFrom);
            $(regexListItem[j]).find('.regex-to').val(regexTo);
        }
    }

    // Scripts
    function loadScripts() {
        var scriptDiv = document.getElementById('script-for-bookmarklet');
        var re = /src="([^"]+)"/g;
        var scripts = [], match, script;

        while ((match = re.exec(scriptDiv.innerHTML))) {
            scripts.push(match[1]);
            script = location.protocol + '//' + location.host + match[1];
            sendMessage('add_script', {src: script});
        }
    }

    // Should return "true" for both "attribute-field-n-name" and "attribute-
    // field-n-value" fields, as well as the wrapper field "attribute-field-n".
    function isAttributeField(field) {
        if (!field) {
            return false;
        }
        return field.startsWith(ATTRIBUTE_FIELD_PREFIX);
    }

    function isVariantDimensionButtonField(field) {
        if (!field) {
            return false;
        }
        return field.startsWith(VARIANT_DIMENSION_BUTTON_PREFIX);
    }

    // Given a button or attribute field name of the format "variant-button-n"
    // or "attribute-field-n-name", returns n.
    function indexFromFieldName(field) {
        var prefix;
        if (isVariantDimensionButtonField(field)) {
            prefix = VARIANT_DIMENSION_BUTTON_PREFIX;
        } else if (isAttributeField(field)) {
            prefix = ATTRIBUTE_FIELD_PREFIX;
        } else {
            // We should never call this function on a non-dimension-button, non-
            // attribute field: something is wrong.
            log('UNEXPECTED BEHAVIOR! Called "indexFromFieldName" on a field that ' +
                'was neither a dimension button field nor an attribute field: ' + field);
            return;
        }

        var re = new RegExp(prefix+"(\\d+).*");
        var matches = field.match(re);
        return matches && matches.length > 1 ? parseInt(matches[1]) : "";
    }

    // Return config for given field from the existing training data. ("Field"
    // is not so much the name of a field as the id of the edited element,
    // which may or/may not correspond directly to a field name.)
    // TODO(maia): rename "field" throughout this code to something more
    // descriptive, like 'id'?
    function getFieldConfig(field) {
        // This is a variant dimension button or subfield thereof; we return the
        // config for the appropriate subfield, if it's a subfield, otherwise for
        // the entire attribute).
        if (isAttributeField(field)) {
            // Find the relevant fieldConfig for the entire attribute
            var attrIndex = indexFromFieldName(field);
            var attrTD = trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY][attrIndex];

            if (field.includes(ATTRIBUTE_NAME_SUFFIX)) {
                // It's an attribute name selector
                return attrTD[ATTRIBUTE_NAME_KEY];
            } else if (field.includes(ATTRIBUTE_VALUE_SUFFIX)) {
                // It's an attribute value selector
                return attrTD[ATTRIBUTE_VALUE_KEY];
            } else {
                // It's the top-level field, return the whole config.
                return attrTD;
            }
        }

        // This is a variant dimension button or subfield thereof; we return the
        // config for the appropriate subfield, if it's a subfield, otherwise for
        // the entire button).
        if (isVariantDimensionButtonField(field)) {
            // Button section contains 4 elements with IDs:
            // - grouping, generic one in the form of 'variant-button-7'
            // - one for active buttons, in the form of 'variant-button-7-active'
            // - one for inactive buttons, in the form of 'variant-button-7-inactive'
            // - one for all active button values, in the form of 'variant-button-7-all-button-values'

            // Find the relevant fieldConfig for the entire button
            var buttonIndex = indexFromFieldName(field);
            var buttonTD = trainingData[VARIANT_DIMENSION_BUTTONS_KEY][buttonIndex];

            if (field.includes(ACTIVE_BUTTONS_ID_SUFIX)) {
                // It's an active buttons selector.
                return buttonTD[ACTIVE_BUTTONS_KEY];
            } else if (field.includes(INACTIVE_BUTTONS_ID_SUFIX)) {
                // It's an inactive buttons selector.
                return buttonTD[INACTIVE_BUTTON_VALUES_KEY];
            } else if (field.includes(ALL_BUTTON_VALUES_ID_SUFIX)) {
                // It's an all button values selector.
                return buttonTD[ALL_BUTTON_VALUES_KEY];
            } else {
                // It's the top-level field, return the whole config.
                return buttonTD;
            }
        }

        // This is a regular variant or product field.
        var fieldGroup = fieldToFieldGroup[field];
        if (fieldGroup === 'product') {
            return trainingData[field];
        } else if (fieldGroup === 'variant') {
            return trainingData[VARIANT_FIELDS_KEY][field];
        } else {
            log('getFieldConfig called with field not in product nor variant', field);
        }

        return trainingDataForField;
    }

    function getFieldType(field) {
        if (isVariantDimensionButtonField(field)) {
            if (field.includes(ACTIVE_BUTTONS_ID_SUFIX)) {
                return trainingDataVariantDimensionButtonSchema[ACTIVE_BUTTONS_KEY];
            } else if (field.includes(INACTIVE_BUTTONS_ID_SUFIX)) {
                return trainingDataVariantDimensionButtonSchema[INACTIVE_BUTTON_VALUES_KEY];
            } else if (field.includes(ALL_BUTTON_VALUES_ID_SUFIX)) {
                return trainingDataVariantDimensionButtonSchema[ALL_BUTTON_VALUES_KEY];
            } else {
                log(
                    'getFieldType called for a button with an unknown type:', field);
            }
            return '';
        }

        if (isAttributeField(field)) {
            return 'string';
        }

        var fieldGroup = fieldToFieldGroup[field];
        if (fieldGroup === 'product') {
            return trainingDataSchema[field];
        } else if (fieldGroup === 'variant') {
            return trainingDataVariantFieldSchema[field];
        } else {
            log(
                'getFieldType called with field not in product nor variant:', field);
        }
    }

    // Set training data for the given field (i.e., take the user input in the
    // gui/text editor, insert it into the trainingData global variable).
    function setFieldConfigFromUserInput(field, snippet) {
        // When we modify "trainingDataField," we're actually updating
        // "trainingData" ("trainingDataField" is a REFERENCE to the config object
        // stored in TrainingData).
        var trainingDataField = getFieldConfig(field);

        if (trainingDataField.type !== 'js') {
            var cssSelectorVal = $('#' + field + ' .selector').val();
            var attributeSelectorVal = $('#' + field + ' .attribute').val();
            trainingDataField.cssSelector = cssSelectorVal;
            trainingDataField.attribute = attributeSelectorVal;
        } else if (snippet !== undefined) {
            trainingDataField.snippet = snippet;
        }

        var regexesList = $('#' + field + ' .regex-list li');
        trainingDataField.substitution = [];
        for (var i = 0; i < regexesList.length; i++) {
            var toFind = regexesList.eq(i).find('.regex-from').val();
            var toReplace = regexesList.eq(i).find('.regex-to').val();
            trainingDataField.substitution[i] = {
                to_find: toFind,
                to_replace: toReplace
            };
        }
    }

    // Saves training data in the DB.
    function saveTrainingData() {
        log('Saving trainingData: ', trainingData);
        var dataToSend = JSON.stringify({
            version: 3,
            trainingData: trainingData
        });
        log('Sending training data to server: ', dataToSend);

        $.ajax({
            method: 'POST',
            url: '/api/1/training',
            contentType: 'JSON',
            dataType: 'JSON',
            data: JSON.stringify({
                host: topDomain,
                type: 'product',
                data: dataToSend
            }),
            success: function(data) {}
        });
    }

    // Request validation.
    function validateTrainingData(e) {
        e.preventDefault();
        hideErrorModal();
        $('#validation-dialog .contents').show();
        $('#validation-dialog').dialog({width: 500});

        return $.ajax({
            method: 'POST',
            url: '/api/1/training/validate',
            contentType: 'JSON',
            dataType: 'JSON',
            data: JSON.stringify({
                host: topDomain,
                type: 'product',
                data: JSON.stringify({
                    version: 3,
                    trainingData: trainingData
                })
            })
        });
    }

    function showErrorModalWithMsg(msg) {
        errorModalMsg.html(msg);
        errorModal.show();
    }

    function hideErrorModal() {
        errorModal.hide();
        errorModalMsg.html('');
    }

    // Generates an integer index for a newly inserted attribute field config.
    function getNextAttributeFieldId() {
        return $('.attribute-selector:not([id$="template"])').length;
    }

    // Generates an integer index for a newly inserted dimension button field config.
    function getNextVariantDimensionButtonId() {
        return $('.variant-buttons-selector:not([id$="template"])').length;
    }

    // Append to DOM.
    function onAddAttributeFieldClicked(e) {
        e.preventDefault();
        e.stopPropagation();

        // Get index for the new element we're creating.
        var newAttrIndex = getNextAttributeFieldId();
        var newAttrFieldId = ATTRIBUTE_FIELD_PREFIX + newAttrIndex;

        // Insert into training data.
        insertTrainingDataForNewAttributeField();

        // Insert into DOM.
        insertAttributeSelectorInDomAtIndex(newAttrIndex);

        // Expand to ease editing.
        expandSelector(newAttrFieldId);
    }

    // Expects a jQuery object with id="prefix-n" (and possibly with subfields
    // with id="prefix-x-suffix"). Reassigns id's for this object and any
    // relevant subfields to "prefix-n(-suffix)" (where n is the int provided).
    function updateFieldIndices(elem, n, prefix, suffixes) {
        elem.attr('id', prefix + n);
        for (var i = 0; i < suffixes.length; i++) {
            var queryStr = '[id$="' + suffixes[i] + '"]';
            elem.find(queryStr).attr('id', prefix + n + suffixes[i]);
        }
    }

    // Inserts a new attribute selector field (and all its subfields) into the
    // DOM at index i.
    function insertAttributeSelectorInDomAtIndex(i) {
        var selectorsContainer = $('#field-attributes-container');
        var selectorTemplateClone = $('#attribute-field-template').clone();
        var attributeFieldId = ATTRIBUTE_FIELD_PREFIX + i;

        // Assign proper IDs.
        updateFieldIndices(selectorTemplateClone, i,
            ATTRIBUTE_FIELD_PREFIX, ATTRIBUTE_FIELD_SUFFIXES);

        // Create proper radio button groups;
        selectorTemplateClone
            .find('input[type="radio"][name="attribute-field-selector-type"]')
            .attr('name', attributeFieldId + '-attribute-field-selector-type');

        // Insert into DOM.
        selectorTemplateClone.appendTo(selectorsContainer);

        // Add event handlers.
        selectorTemplateClone.find('button.input-modal-trigger')
            .on('click', showOrHideEditFieldModal);
        selectorTemplateClone.find('.field-name-container')
            .on('click', showOrHideEditFieldModal);
        selectorTemplateClone.find('.update-selector')
            .on('click', update);
        selectorTemplateClone.find('.add-regex a')
            .on('click', addAnotherSetOfRegexInputs);
        selectorTemplateClone.find('.field-type-selector.selector-type-js')
            .on('click', openEditor);
        selectorTemplateClone.find('.field-type-selector.selector-type-css')
            .on('click', useCssSelector);
        selectorTemplateClone.find('.field-type-selector.selector-type-css')
            .on('change', useCssSelector);
        selectorTemplateClone.find('.css-selector-label')
            .on('click', useCssSelector);
        selectorTemplateClone.find('button.remove-button')
            .on('click', removeAttributeField);

        selectorTemplateClone.find('.attribute-id')
            .on('focus', storeOldInputValue.bind(undefined, attributeFieldId));

        // Automated selection of CSS radio button when user edits selector or attribute.
        selectorTemplateClone.find('.css-selector .selector')
            .on('click', onUpdateCssSelectorState);
        selectorTemplateClone.find('.css-selector .attribute')
            .on('click', onUpdateCssSelectorState);

        updateCssSelectorState(selectorTemplateClone.find('.css-group'));
    }

    function expandSelector(fieldId) {
        $('#' + fieldId).find('button.input-modal-trigger')
            .trigger('click');
    }

    // Stores the old value of the input into the oldValue attribute.
    function storeOldInputValue(fieldId) {
        var attributeNameElement = $('#' + fieldId + ' .attribute-id');
        attributeNameElement.attr('oldValue', attributeNameElement.val());
    }

    // Append to DOM.
    function onAddVariantDimensionButtonClicked(e) {
        e.preventDefault();
        e.stopPropagation();

        // Get index for the new element we're creating.
        var newButtonIndex = getNextVariantDimensionButtonId();
        var newButtonFieldId = VARIANT_DIMENSION_BUTTON_PREFIX + newButtonIndex;

        // Insert into training data.
        insertTrainingDataForNewVariantDimensionButton();

        // Insert into DOM.
        insertVariantDimensionButtonSelectorInDomAtIndex(newButtonIndex);

        // Expand to ease editing.
        expandSelector(newButtonFieldId);
    }

    // Inserts a new variant dimension button selector field (and all its
    // subfields) into the DOM at index i.
    function insertVariantDimensionButtonSelectorInDomAtIndex(i) {
        var selectorsContainer = $('#variant-buttons-container');
        var selectorTemplateClone =
            $('#variant-dimension-button-template').clone();
        var variantDimensionButtonId = VARIANT_DIMENSION_BUTTON_PREFIX + i;

        // Assign proper IDs.
        updateFieldIndices(selectorTemplateClone, i,
            VARIANT_DIMENSION_BUTTON_PREFIX, VARIANT_DIMENSION_BUTTON_SUFFIXES);

        // Create proper radio button groups;
        selectorTemplateClone
            .find('input[type="radio"][name="active-button-selector-type"]')
            .attr('name', variantDimensionButtonId + '-active-button-selector-type');
        selectorTemplateClone
            .find('input[type="radio"][name="inactive-button-selector-type"]')
            .attr('name', variantDimensionButtonId + '-inactive-button-selector-type');
        selectorTemplateClone
            .find('input[type="radio"][name="all-button-values-selector-type"]')
            .attr('name', variantDimensionButtonId + '-all-button-values-selector-type');

        // Add event handlers.
        selectorTemplateClone.find('button.input-modal-trigger')
            .on('click', showOrHideEditFieldModal);
        selectorTemplateClone.find('.field-name-container')
            .on('click', showOrHideEditFieldModal);
        selectorTemplateClone.find('.update-selector')
            .on('click', update);
        selectorTemplateClone.find('.add-regex a')
            .on('click', addAnotherSetOfRegexInputs);
        selectorTemplateClone.find('.field-type-selector.selector-type-js')
            .on('click', openEditor);
        selectorTemplateClone.find('.field-type-selector.selector-type-css')
            .on('click', useCssSelector);
        selectorTemplateClone.find('.field-type-selector.selector-type-css')
            .on('change', useCssSelector);
        selectorTemplateClone.find('.css-selector-label')
            .on('click', useCssSelector);
        selectorTemplateClone.find('button.remove-button')
            .on('click', removeButton);

        selectorTemplateClone.find('.attribute-id').on(
            'change',
            updateAttributeFieldTitle.bind(undefined, variantDimensionButtonId));

        // Automated selection of CSS radio button when user edits selectors.
        selectorTemplateClone.find('.selector.active-buttons')
            .on('click', onUpdateCssSelectorState);
        selectorTemplateClone.find('.attribute.active-buttons')
            .on('click', onUpdateCssSelectorState);
        selectorTemplateClone.find('.selector.inactive-buttons')
            .on('click', onUpdateCssSelectorState);
        selectorTemplateClone.find('.attribute.inactive-buttons')
            .on('click', onUpdateCssSelectorState);
        selectorTemplateClone.find('.selector.all-button-values')
            .on('click', onUpdateCssSelectorState);
        selectorTemplateClone.find('.attribute.all-button-values')
            .on('click', onUpdateCssSelectorState);

        // Set CSS selectors as default for active and inactive buttons.
        updateCssSelectorState($(selectorTemplateClone.find('.css-group')[0]));
        updateCssSelectorState($(selectorTemplateClone.find('.css-group')[1]));
        updateCssSelectorState($(selectorTemplateClone.find('.css-group')[2]));

        // Make sure that only last button has the inactive buttons section visible.
        $('.last-variant-dimension').removeClass('last-variant-dimension');
        selectorTemplateClone.addClass('last-variant-dimension');

        // Insert into DOM.
        selectorTemplateClone.appendTo(selectorsContainer);
    }

    function insertTrainingDataForNewAttributeField() {
        // Clone an empty attribute field training data.
        var newAttributeFieldTrainingData = jQuery.extend(
            true, {}, emptyAttributeFieldTrainingData);
        var attributesArray = trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY];
        attributesArray.push(newAttributeFieldTrainingData);
    }

    function insertTrainingDataForNewVariantDimensionButton() {
        // Clone an empty variant dimension button training data.
        var newButtonTrainingData = jQuery.extend(
            true, {}, emptyVariantDimensionButtonTrainingData);
        var buttonsArray = trainingData[VARIANT_DIMENSION_BUTTONS_KEY];
        buttonsArray.push(newButtonTrainingData);
    }

    // Updates the title of a variant dimension button section with the name of
    // the attribute it is bound to.
    // NOTE(maia): currently this function changes the title of a BUTTON config,
    // not an attribute config :(
    function updateAttributeFieldTitle(fieldIdToUpdate) {
        // TODO(maia) need to do something with this function...?
        $('#' + fieldIdToUpdate + ' .attribute-id-display').text(
            $('#' + fieldIdToUpdate + ' .attribute-id').val());
    }

    // Selects CSS radio button if someone clicks on the text field.
    function onUpdateCssSelectorState(e) {
        updateCssSelectorState($(e.target).closest('.css-group'));
    }

    function updateCssSelectorState(cssGroup) {
        cssGroup.find('input[type="radio"].selector-type-css')
            .attr('checked', true);
    }

    function removeAttributeField(e) {
        e.preventDefault();
        e.stopPropagation();

        var attributeFieldName = getFieldNameFromEvent(e);
        var attributeSelectorElement = $('#' + attributeFieldName);
        var numAttrConfigs = trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY].length;

        // Remove from the training data.
        var attributeToRemoveIndex = indexFromFieldName(attributeFieldName);
        trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY].splice(
            attributeToRemoveIndex, 1);

        // Remove from DOM.
        attributeSelectorElement.remove();

        // Update indices of remaining attribute config html elements.
        for (var i = attributeToRemoveIndex + 1; i < numAttrConfigs; i++) {
            var elem = $('#' + ATTRIBUTE_FIELD_PREFIX + i);
            updateFieldIndices(elem, i - 1, ATTRIBUTE_FIELD_PREFIX, ATTRIBUTE_FIELD_SUFFIXES);
        }


        saveTrainingData();
        scrapeCurrentPage();
    }

    function removeButton(e) {

        e.preventDefault();
        e.stopPropagation();

        var buttonFieldName = getFieldNameFromEvent(e);
        var buttonSelectorElement = $('#' + buttonFieldName);
        var numButtonConfigs = trainingData[VARIANT_DIMENSION_BUTTONS_KEY].length;

        // Remove from the training data.
        var buttonToRemoveIndex = indexFromFieldName(buttonFieldName);
        trainingData[VARIANT_DIMENSION_BUTTONS_KEY].splice(buttonToRemoveIndex, 1);

        // Remove from DOM.
        buttonSelectorElement.remove();

        // Update indices of remaining button config html elements.
        for (var i = buttonToRemoveIndex + 1; i < numButtonConfigs; i++) {
            var elem = $('#' + VARIANT_DIMENSION_BUTTON_PREFIX + i);
            updateFieldIndices(elem, i - 1, VARIANT_DIMENSION_BUTTON_PREFIX,
                VARIANT_DIMENSION_BUTTON_SUFFIXES);
        }


        // Make sure that only last button displays inactive-buttons and
        // all-button-values sections.
        $('.last-variant-dimension').removeClass('last-variant-dimension');
        $('#variant-buttons-container .variant-buttons-selector:last').
        addClass('last-variant-dimension');

        saveTrainingData();
        scrapeCurrentPage();
    }

    function insertAnotherRegexFieldSet(regexList) {
        var regexTemplateClone = $('#regex-field-template').clone();
        regexTemplateClone.removeAttr('id');
        regexTemplateClone.find('.remove-regex').on('click', onRemoveRegexField);
        regexList.append(regexTemplateClone);
    }

    function onRemoveRegexField(e) {
        e.preventDefault();
        e.stopPropagation();
        var regexFieldSetToRemove = $(e.target).parent().parent();
        regexFieldSetToRemove.remove();

        var field = getFieldNameFromEvent(e);
        setFieldConfigFromUserInput(field);
        saveTrainingData();
    }

    function showOrHideEditFieldModal(e) {
        e.preventDefault();
        e.stopPropagation();
        var targetElem = $(e.target);
        var field = getFieldNameFromEvent(e);
        var currentModal = $('#' + field + ' .input-modal');
        var expandCollapseIcon = $('#' + field + ' button.input-modal-trigger');
        if (currentModal.is(':visible')) {
            currentModal.slideUp();
            expandCollapseIcon.text('►');
        } else {
            $('.input-modal').hide();
            currentModal.slideDown();
            expandCollapseIcon.text('▼');
        }
    }

    // Scrape page for all product info--i.e., product-level fields and all variants.
    function onScrapeAndShowVariants(e) {
        e.stopPropagation();
        e.preventDefault();

        // Set the UI state.
        uiState.scrapeMode = SCRAPE_MODE_ALL_VARIANTS;
        uiState.status = UI_STATUS_SCRAPING;

        // Disable button.
        var scrapeAllButton = $('#scrape-whole');
        scrapeAllButton.prop('disabled', true);
        scrapeAllButton.text('Scraping...');
        log('Scraping for whole product (all variants)');

        // Send scrape request.
        sendMessage('scrapeWholeProduct', trainingData);
    }

    function onScrapePage(e) {
        e.stopPropagation();
        e.preventDefault();
        scrapeCurrentPage();
    }

    // Scrape page for all product-level fields, and for the current variant
    // selected (no page interaction involved; response will contain a single
    // variant reflecting the current state of the page).
    function scrapeCurrentPage() {
        log('Scraping current page');
        uiState.scrapeMode = SCRAPE_MODE_SINGLE_VARIANT;
        uiState.status = UI_STATUS_SCRAPING;
        sendMessage('scrapeCurrentPage', trainingData);
    }

    function sendMessage(msg, data) {
        var msgWrapper = {
            msg: msg,
            data: (data || {})
        };
        top.postMessage(JSON.stringify(msgWrapper), window.topDomain);
    }

    // Handle messages from the main page.
    function onMessage(e) {
        if (e.origin !== topDomain) {
            return;
        }
        var data = JSON.parse(e.data);
        var message = data.msg;
        if (message === 'script:loaded') {
            // As we support left and right hand panel, we adjust styles in here.
            var className = data.data;
            $('.container').addClass(className);
            showTrainingData();
            scrapeCurrentPage();
            sendMessage('bookmarklet:opened');
        } else if (message === 'displayProduct') {
            log('Product data from bookmarklet.js (pre-cleaning):', data.data);
            $('.error').html('');
            displayProduct(data.data.productData, data.data.errors);
        } else if (message === 'die') {
            // Scrape was just aborted, reset GUI (so it's not stuck) and display error.
            uiState.status = UI_STATUS_DISPLAYING;
            var scrapeAllButton = $('#scrape-whole');
            scrapeAllButton.prop('disabled', false);
            scrapeAllButton.text('Scrape & show all variants');
            log(data.data.error);
            alert(data.data.error);
            showErrorModalWithMsg(data.data.error);
        } else {
            log('Received unknown message: ', message);
        }
    }

    function displayProduct(productData, scrapingErrors) {
        uiState.status = UI_STATUS_DISPLAYING;
        var scrapeAllButton = $('#scrape-whole');
        scrapeAllButton.prop('disabled', false);
        scrapeAllButton.text('Scrape & show all variants');

        // Cleaning data removes error messages. Extract error messages for
        // variants first.
        var uncleanedVariants = productData[VARIANTS_KEY];

        if (uncleanedVariants && uncleanedVariants.length > 0) {
            var firstUncleanedVariant = uncleanedVariants[0];
            if (firstUncleanedVariant.errors) {
                // TODO(joanna): Add ability to display cleaning errors (i.e. regex
                // errors) for variant fields, as well as scraping errors.

                // Display errors at the variant field level (for price, images, etc.).
                displayErrors(
                    firstUncleanedVariant.errors,
                    null /* cleaningErrors */,
                    variantFields);
                // Display errors at the variant attribute level (for color, size, etc.).
                displayVariantAttributesErrors(firstUncleanedVariant.errors[NAMED_ATTRIBUTES_KEY]);
            }
        }

        $.when(cleanProductData(productData, trainingData))
            .then(function (cleanedProductData) {
                log('Product data to display: ', cleanedProductData);
                // Display errors at the product field level (for title, description, etc).
                displayErrors(scrapingErrors, cleanedProductData.errors, productFields);
                // Display data for title, description, etc.
                displayFieldsData(cleanedProductData, productFields);

                var variants = cleanedProductData[VARIANTS_KEY];
                if (variants && variants.length > 0) {
                    // Display the result of scraping the first variant in the GUI.
                    displayVariant(cleanedProductData.variants[0]);
                    // And if in 'show all' mode - display all the variants.
                    if (uiState.scrapeMode == SCRAPE_MODE_ALL_VARIANTS) {
                        clearVariantsSummary();
                        for (var i = 0; i < variants.length; i++) {
                            insertVariantSummary(variants[i]);
                        }
                        $('#variants-dialog').dialog({width: 500});
                    }
                } else {
                    log('displayProduct called with no variants after clean.');
                    if (uiState.scrapeMode == SCRAPE_MODE_ALL_VARIANTS) {
                        clearVariantsSummary();
                        $('#variants-dialog').text('No variants found.');
                        $('#variants-dialog').dialog();
                    }
                }
            });
    }

    function insertVariantSummary(variant) {
        var variantsDialogContainer = $('#variants-dialog');
        var variantSummaryTemplateClone = $('#variant-summary-template').clone();
        var i;

        // Fill in variant fields.
        variantSummaryTemplateClone.removeAttr('id');

        var fieldValuesContainer = variantSummaryTemplateClone
            .find('.field-summary-container');
        createAndAppendFieldSummary(
            'Price', variant.price, fieldValuesContainer);
        createAndAppendFieldSummary(
            'Original price', variant.original_price, fieldValuesContainer);
        createAndAppendFieldSummary(
            'GTIN', variant.gtin, fieldValuesContainer);
        // TODO(joanna): Add images.
        createAndAppendFieldSummary(
            'Quantity', variant.quantity, fieldValuesContainer);
        var attributes = variant[NAMED_ATTRIBUTES_KEY];
        for (i = 0; i < attributes.length; i++) {
            createAndAppendFieldSummary(
                attributes[i][ATTRIBUTE_NAME_KEY], attributes[i][ATTRIBUTE_VALUE_KEY],
                fieldValuesContainer);
        }
        var images = variant.images || [];
        var imagesContainer =
            variantSummaryTemplateClone.find('.images-container');
        for (i = 0; i < images.length; i++) {
            createAndAppendImageSummary(images[i], imagesContainer);
        }
        // Insert into DOM.
        variantSummaryTemplateClone.appendTo(variantsDialogContainer);
    }

    function createAndAppendImageSummary(image, container) {
        var imageTemplateClone = $('#image-field-template').clone();
        imageTemplateClone.removeAttr('id');
        imageTemplateClone.find('img').attr('src', image);
        imageTemplateClone.appendTo(container);
    }

    function createAndAppendFieldSummary(fieldName, fieldValue, container) {
        var fieldSummaryTemplateClone = $('#variant-field-summary-template').clone();
        fieldSummaryTemplateClone.removeAttr('id');
        fieldSummaryTemplateClone.find('.field-name').text(fieldName);
        fieldSummaryTemplateClone.find('.field-value').text(fieldValue);
        fieldSummaryTemplateClone.appendTo(container);
    }

    function clearVariantsSummary() {
        $('#variants-dialog').html('');
    }

    function displayVariant(variant) {
        // Display data for price, images, etc.
        displayFieldsData(variant, variantFields);
        // Display data at the variant attribute level (for color, size, etc.).
        displayVariantAttributesData(variant[NAMED_ATTRIBUTES_KEY]);
    }

    function displayVariantAttributesData(attributes) {
        for (var i = 0; i < attributes.length; i++) {
            var field = ATTRIBUTE_FIELD_PREFIX + i;
            if (attributes[i]) {
                var attributeName = attributes[i][ATTRIBUTE_NAME_KEY];
                if (attributeName) {
                    displayFieldData(field, attributeName, 'attribute-name-display');
                }

                var attributeValue = attributes[i][ATTRIBUTE_VALUE_KEY];
                if (attributeValue) {
                    displayFieldData(field, attributeValue, 'attribute-value-display');
                }
            }
        }
    }

    function displayVariantAttributesErrors(attributeErrors) {
        if (attributeErrors) {
            for (var i = 0; i < attributeErrors.length; i++) {
                if (attributeErrors[i]) {
                    var error;
                    var field;
                    if (attributeErrors[i][ATTRIBUTE_NAME_KEY]) {
                        error = attributeErrors[i][ATTRIBUTE_NAME_KEY];
                        // HACK(maia): passing a Frankenfield to displayError so the error
                        // gets shown in the right place
                        field = ATTRIBUTE_FIELD_PREFIX + i + ' .attribute-name-display-wrapper';
                        displayError(field, error);
                    }
                    if (attributeErrors[i][ATTRIBUTE_VALUE_KEY]) {
                        error = attributeErrors[i][ATTRIBUTE_VALUE_KEY];
                        // HACK(maia): passing a Frankenfield to displayError so the error
                        // gets shown in the right place
                        field = ATTRIBUTE_FIELD_PREFIX + i + ' .attribute-value-display-wrapper';
                        displayError(field, error);
                    }
                }
            }
        }
    }

    function displayFieldsData(fieldArray, keysToDisplay) {
        for (var i = 0; i < keysToDisplay.length; i++) {
            var fieldName = keysToDisplay[i];
            var fieldValue = fieldArray[fieldName];
            if (fieldValue !== null && fieldValue !== undefined) {
                displayFieldData(fieldName, fieldValue);
            } else {
                // Reset field value.
                displayFieldData(fieldName, undefined);
            }
        }
    }

    // Get fieldType for given field, and call the appropriate method to set the
    // value of "#field .field-value" = fieldValue. Some methods also support an
    // extra selector (i.e. we fill in the value of html element
    // "#field .extra_selector .field-value")
    function displayFieldData(field, fieldValue, extra_selector='') {
        var fieldType = getFieldType(field);
        smartRemoveErrorForField(field, fieldValue);

        if (fieldType === 'bool') {
            setBooleanFieldValue(field, fieldValue ? fieldValue : false);
        } else if (fieldType === 'string') {
            // NOTE(maia): currently this is the only method that supports
            // additional argument 'extra_selector'!!
            var stringFieldValue = (fieldValue === undefined) ? '' : '' + fieldValue;
            setStringFieldValue(field, stringFieldValue, extra_selector);
        } else if (fieldType === 'array') {
            setArrayFieldValue(field, fieldValue ? fieldValue : []);
        } else {
            log(
                'Unknown field type for field: ' + field + ', type: ' + fieldType);
        }
    }

    function setBooleanFieldValue(field, value) {
        $('#' + field + ' .field-value').html(value.toString());
    }

    // Sets html of "#field (.extra_selector) .field-value" = value
    function setStringFieldValue(field, value, extra_selector='') {
        var selectorString = '#' + field;
        if (extra_selector) {
            selectorString += ' .' + extra_selector;
        }
        selectorString += ' .field-value';
        $(selectorString).html(value);
    }

    function setArrayFieldValue(field, value) {
        if (value) {
            var outputList = $('#' + field + ' .output-list');
            outputList.html('');
            for (var i = 0; i < value.length; ++i) {
                var outputListItem = $('<li>');
                var itemString = value[i];
                if (field === 'images') {
                    var imgLink = $('<a>').attr('href', itemString);
                    imgLink.attr('target', '_blank');
                    var imgTag = $('<img>').attr('src', itemString);
                    imgTag.attr('class', 'gui-image-thumb');
                    imgLink.append(imgTag);
                    outputListItem.append(imgLink);
                }
                outputListItem.append(itemString);
                outputList.append(outputListItem);
            }
        }
    }

    // Removes an error on a given field if the value is not empty.
    function smartRemoveErrorForField(field, value) {
        if (!!value) {
            $('#' + field).removeClass('has-error');
        }
    }

    // Logs prefixed message to the console.
    function log(msg, obj) {
        if (obj === undefined) {
            console.log('[UI] ' + msg);
        } else  {
            console.log('[UI] ' + msg, obj);
        }
    }

    function displayErrors(scrapingErrors, cleaningErrors, fieldKeys) {
        // If either error map is null, initialize it so we can key into it w/o
        // throwing a TypeError.
        if (!(scrapingErrors)) {
            scrapingErrors = {};
        }
        if (!(cleaningErrors)) {
            cleaningErrors = {};
        }

        for (var i = 0; i < fieldKeys.length; i++) {
            // NOTE(maia): We assume that no field will have both a scrapingError
            // and a relevant cleaningError (since a scrapingError implies that no
            // data was returned to clean). Hence showing cleaning error first, and
            // overriding by scraping error if needed.
            var field = fieldKeys[i];
            displayError(field, cleaningErrors[field]);
            displayError(field, scrapingErrors[field]);
        }
    }

    function displayError(field, error) {
        if (error) {
            // Erase currently displayed data.
            displayFieldData(field, undefined);
            var errorElem = $('#' + field + ' .error');
            errorElem.html(error);

            // TODO(maia): when displaying attribute errors, we mark an inner HTML
            // element as '.has-error' and the sidebar doesn't turn red. Should fix.
            $('#' + field).addClass('has-error');
        }
    }

    // Clean data via Go endpoint (strips out HTML, handles special characters,
    // performs regex substitutions).
    function cleanProductData(productData, trainingData) {
        return $.ajax({
            method: 'POST',
            url: '/api/1/training/clean_product',
            contentType: 'JSON',
            data: JSON.stringify({
                // TODO: Remove version tag once we sunset other versions.
                version: 3,
                training_data: trainingData,
                product_data: productData
            })
        });
    }

    init();

})(window.jQuery);
