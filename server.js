require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// MyPOS configuration
const IS_PRODUCTION = process.env.MYPOS_PRODUCTION === 'true'; // Set to 'true' for live payments
const MYPOS_CHECKOUT_URL = IS_PRODUCTION 
  ? 'https://www.mypos.com/vmp/checkout'
  : 'https://www.mypos.com/vmp/checkout-demo';

// MyPOS credentials
const MYPOS_SID = process.env.MYPOS_CLIENT_ID || 'miWRnE8t6OPHyvEGyahKqFDM';
const MYPOS_WALLET = process.env.MYPOS_WALLET || 'miWRnE8t6OPHyvEGyahKqFDM';
const MYPOS_PRIVATE_KEY = process.env.MYPOS_PRIVATE_KEY || `-----BEGIN RSA PRIVATE KEY-----
MIICXQIBAAKBgQC3PG6ib6TH81BsyFDFzI4hthIwLXR6UvE8m+0Pg+4KDIHcPQ/r
Rzy/cwce65Rjsi96iJNA5ZG8k53WMEYsO3WM4fkOAoA8ViS9TeKwbiU1UMzx3OPQ
9x6Q/8VoRhrNaLYPE/iGQwwd+lH1zxi4JNUw6whOMoLexhWSs1yCO7X0/QIDAQAB
AoGALlymCYeCA+12Xe/ZMBLvq2vr8jCuFf1CeHljY9eXtQcxHE5+5qLhpfcuyA4H
P6poBPLlfzgWxcX726PfPXXV6d+bNene12uRwEAsOD/BOVUil+pkyoEiviIWDRwV
hmSRkuRsCBRaZ//JnBSMYi+b6rTgPxtoWHboQohcy5Y2uwECQQDqPiyTlRRCFgVd
S94dsu3ZLOOr38TqCSx8l34Qbx/aTrsaBdRdrVLtfysZgzIkiaZ/5WxBiZ4fFPRy
ldmeIY6dAkEAyEFrIJpsri06Ra2x3PG412/u3fofKj4xNpIvN6MOUqhNHyvXGL3r
WCNaAaBpYOBU1b1EYc5d168cpzxcrH0B4QJBAN/T30Z6emwXnLKkjy6zziDqivau
EPxNHcxD+fr8JGS3PIPGNEH7H7W/AVEUkzJkscueTw5k0MoEfPyNAe/fQuUCQBNC
b2ooT/GEegk/hk6olM1rf36r0pl+d7822gGw1ezPMPOhhMNlaKAGbl6freLaUG5q
EIyTi2T1+3x+Cq+wKiECQQDDazDtgAZnlZb9vmf8u1w
