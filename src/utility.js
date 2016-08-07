'use strict'

const multihashing = require('multihashing')
const crypto= require('crypto')
const ayb = require('all-your-base')


let util = {}

util.hash = (data) => multihashing(data, 'sha2-256')

util.hasher= () => {return crypto.createHash('sha256')}

util.intToBuffer= (int)=>{
  if(isNaN(int)){
    throw new Error("Must be an integer")
  }
  int= Math.floor(int)
  let hex = ayb.decToHex(int)
  if((hex.length > 0) && (hex.length % 2 === 1)){
    hex= '0' + hex
  }
  let hexBuf = new Buffer(hex,'hex')
  if(hexBuf.length < 8){
    let stuffin = Buffer.alloc(8-hexBuf.length)
    hexBuf= Buffer.concat([stuffin, hexBuf])
  }
  return hexBuf
}

util.euclid = (a, b) =>{
  if(isNaN(a) || isNaN(b)){
    throw new Error("Must be two Numbers")
  }
  return Math.abs(a - b)
}

module.exports= util