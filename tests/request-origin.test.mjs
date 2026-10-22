import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasAllowedOrigin} from '../lib/request-origin.mjs';
test('browser origin checks use public Host with forwarded protocol and reject foreign origins',()=>{
 function request(headers){return new Request('http://0.0.0.0:3010/api/login',{headers});}
 assert.equal(hasAllowedOrigin(request({origin:'http://localhost:3010',host:'localhost:3010'})),true);
 assert.equal(hasAllowedOrigin(request({origin:'https://delivery.example.com',host:'delivery.example.com','x-forwarded-proto':'https'})),true);
 assert.equal(hasAllowedOrigin(request({origin:'https://evil.example',host:'delivery.example.com','x-forwarded-proto':'https'})),false);
 assert.equal(hasAllowedOrigin(request({origin:'https://evil.example',host:'delivery.example.com','x-forwarded-host':'evil.example','x-forwarded-proto':'https'})),false);
 assert.equal(hasAllowedOrigin(request({origin:'null',host:'localhost:3010'})),false);
 assert.equal(hasAllowedOrigin(request({host:'localhost:3010'})),true);
});
