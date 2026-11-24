const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// We can test different coordinates by temporarily overriding DEMO_HOUSE_GIFTS or testing in browser
console.log('Testing script template');
