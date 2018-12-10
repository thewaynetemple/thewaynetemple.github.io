'use strict';

// Training data that supports variants.
var trainingData = {
    is_product: {},
    title: {},
    description: {},
    tags: {},
    gender: {},
    external_brand: {},
    variant_dimension_buttons: [],
    variant_fields: {
        original_price: {},
        price: {},
        images: {},
        quantity: {},
        gtin: {},
        named_attributes: [] // array of AttributeFieldTrainingData
        // "attributes" <-- legacy, will always be converted
        // to "named_attributes" by ensureTrainingDataHasAllFieldConfigs()
    }
};

// Used only for cloning, when filling in variant_dimension_buttons array.
var emptyVariantDimensionButtonTrainingData = {
    attribute_id: '', // hardcoded, used for matching with attribute configs
    active_buttons: {},
    inactive_button_values: {},
    all_button_values: {}
};

// Used only for cloning, when filling in variant_fields.named_attributes array.
var emptyAttributeFieldTrainingData = {
    attribute_id: '', // hardcoded, used for matching with dimension buttons
    attribute_name: {},
    attribute_value: {}
};

// Schema for the top-level fields of training data.
var trainingDataSchema = {
    is_product: 'bool',
    title: 'string',
    description: 'string',
    tags: 'array',
    gender: 'array',
    external_brand: 'string'
};

// Schema for the variant fields of training data.
var trainingDataVariantFieldSchema = {
    images: 'array',
    price: 'string',
    original_price: 'string',
    quantity: 'string',
    gtin: 'string',
    named_attributes: 'string' // implies that both attr-name and attr-value = 'string'
};

// Schema for the variant dimension buttons in training data.
var trainingDataVariantDimensionButtonSchema = {
    active_buttons: 'jQuery',
    inactive_button_values: 'array',
    all_button_values: 'array'
};

// Maps a field to the group (currently, "product" or "variant") to which it belongs.
var fieldToFieldGroup = {
    is_product: 'product',
    title: 'product',
    description: 'product',
    tags: 'product',
    gender: 'product',
    external_brand: 'product',
    original_price: 'variant',
    price: 'variant',
    images: 'variant',
    quantity: 'variant',
    gtin: 'variant'
};

// To ensure backwards compatibility: make sure training data has all the fields
// we expect from the schema. If not, insert an empty fieldConfig. This should
// only happen when v3 training data is being extended to support a new field.
function ensureTrainingDataHasAllFieldConfigs(trainingData) {
    // TD for all standard fields
    for (var field in fieldToFieldGroup) {
        if (fieldToFieldGroup[field] === 'product') {
            if (trainingData[field] === undefined ||
                trainingData[field] === {}) {
                console.log('[BE] Inserting an empty fieldConfig for the product field: ' + field);
                trainingData[field] = {
                    type: 'css'
                };
            }
        } else if (fieldToFieldGroup[field] === 'variant') {
            if (trainingData[VARIANT_FIELDS_KEY][field] === undefined ||
                trainingData[VARIANT_FIELDS_KEY][field] === {}) {
                console.log('[BE] Inserting an empty fieldConfig for the variant field: ' + field);
                trainingData[VARIANT_FIELDS_KEY][field] = {
                    type: 'css'
                };
            }
        } else {
            console.log('Unrecognized field group! Something is very wrong!');
        }
    }

    // VariantDimensionButtons TD
    for (var i = 0; i < trainingData[VARIANT_DIMENSION_BUTTONS_KEY].length; i++) {
        var buttonConfig = trainingData[VARIANT_DIMENSION_BUTTONS_KEY][i];

        // Rename "attribute_name" to "attribute_id" (or, if no "attribute_id",
        // initialize to empty string)
        if (buttonConfig[ATTRIBUTE_NAME_KEY]) {
            buttonConfig[ATTRIBUTE_ID_KEY] = buttonConfig[ATTRIBUTE_NAME_KEY];
        } else if (!buttonConfig[ATTRIBUTE_ID_KEY]) {
            buttonConfig[ATTRIBUTE_ID_KEY] = '';
        }
        delete buttonConfig[ATTRIBUTE_NAME_KEY];

        for (var subfield in emptyVariantDimensionButtonTrainingData) {
            if (buttonConfig[subfield] === undefined ||
                buttonConfig[subfield] === {}) {
                console.log('[BE] Inserting an empty fieldConfig for \'' + subfield +
                    '\' for variant dimension button config: ' + buttonConfig[ATTRIBUTE_NAME_KEY]);

                // NOTE(maia): buttonConfig is a pointer to the config that lives inside
                // the training data, so modifying this variable also modifies the TD.
                buttonConfig[subfield] = {
                    type: 'css'
                };
            }
        }
    }

    // Attributes TD (if TD contains legacy field "attributes" with hardcoded
    // attribute names and does NOT contain new field "named_attributes", we move this
    // legacy td to "named_attributes" field and save the old hardcoded attribute name
    // into the new attribute_name fieldconfig, as well as into attribute_name)
    if (!trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY]) {
        trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY] = [];
        for (i = 0; i < trainingData[VARIANT_FIELDS_KEY][legacyDoNotUse_ATTRIBUTES_KEY].length; i++) {
            var attrTd = trainingData[VARIANT_FIELDS_KEY][legacyDoNotUse_ATTRIBUTES_KEY][i];
            var attrName = attrTd[ATTRIBUTE_NAME_KEY];

            if (typeof attrName === 'string') {
                // We have an old version of training data with hardcoded attribute
                // names. Convert into new format (separate fieldconfigs for name and
                // value, hardcoded attribute_id for matching with button configs),
                // store in new field.
                console.log('[BE] Inserting a hardcoded fieldConfig for attribute_name for attr ' +
                    i +' (\'' + attrName + '\')');
                delete attrTd[ATTRIBUTE_NAME_KEY];
                var newAttrTd = {
                    attribute_name: {
                        type: 'text',
                        text: attrName
                    },
                    attribute_value: attrTd,
                    attribute_id: attrName
                };

                trainingData[VARIANT_FIELDS_KEY][NAMED_ATTRIBUTES_KEY][i] = newAttrTd;
            }
        }
    }
    delete trainingData[VARIANT_FIELDS_KEY][legacyDoNotUse_ATTRIBUTES_KEY];

    return trainingData;
}

// List of fields that we want to send errors about to DataDog.
var countFieldErrors = {
    is_product: true,
    title: true,
    description: true,
    price: true,
    images: true,
    active_buttons: true,
    inactive_button_values: true
};

// Keeps all fields of training data that are real fields (i.e. not buttons,
// nor other grouping elements).
var configFieldNames = Object.getOwnPropertyNames(fieldToFieldGroup);

// An array of all the names of fields at the product level.
var productFields = configFieldNames.filter(function(elem) {
    return fieldToFieldGroup[elem] === 'product';
});

// An array of all the names of fields at the variant level.
var variantFields = configFieldNames.filter(function(elem) {
    return fieldToFieldGroup[elem] === 'variant';
});

// Constants for key-names (for getting things out of various objects)
var VARIANT_DIMENSION_BUTTONS_KEY = 'variant_dimension_buttons';
var VARIANT_FIELDS_KEY = 'variant_fields';
var VARIANT_RESULTS_KEY = 'variants';
var legacyDoNotUse_ATTRIBUTES_KEY = 'attributes';
var NAMED_ATTRIBUTES_KEY = 'named_attributes'; // attributes with trained names as well as values
var ATTRIBUTE_NAME_KEY = 'attribute_name';
var ATTRIBUTE_VALUE_KEY = 'attribute_value';
var ATTRIBUTE_ID_KEY = 'attribute_id';
var ACTIVE_BUTTONS_KEY = 'active_buttons';
var INACTIVE_BUTTON_VALUES_KEY = 'inactive_button_values';
var ALL_BUTTON_VALUES_KEY = 'all_button_values';
var VARIANTS_KEY = 'variants';
var QUANTITY_KEY = 'quantity';
var IS_PRODUCT_KEY = 'is_product';
