const expect = require('chai').expect
const Peer = require('../src/peer.js')
const randomIp = require('random-ipv4')

describe('Peer id must be buffer', ()=>{
  expect(()=>{
    let peer = new Peer(12)
  }).to.throw(Error);
})