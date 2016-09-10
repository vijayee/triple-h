'use strict'
const Node = require('./node')
const Bucket = require('./bucket')
const Peer = require('./peer')
const util = require('./utility.js')
const hamming = require('hamming-distance')
const randomIp = require('random-ipv4')
const randomInt = require('random-int')
const crypto = require('crypto')
//const pem = require('pem')
const keypair = require('./keypair')
const fs = require('fs')
const mh = require('multihashing')
const bs58 = require('bs58')

const protobuf = require('protocol-buffers')
const rpcproto = protobuf(fs.readFileSync('./proto/rpc.proto'))

/*
//console.log(util.hash(crypto.randomBytes(34)).length)
function put(val,cb){
  let hash = mh(val, 'sha2-256')
  let key = bs58.encode(hash)
  fs.writeFile(key, val ,(err)=>{
    if(err){
      process.nextTick(()=>{
        return cb(err)
      })
    }
  })
}
function get(hash, cb){
  fs.read()
  process.nextTick(()=>{
    return cb(new Error("No put method defined"))
  })
}

let node = new Node('triple-h', noPut, noGet, './node1')
node.on('error', (err)=>{console.log(err)})
node.on('ready', (info)=>{console.log(info.toString())})

/*
keypair.createKeypair((err, pair)=>{
  if (err){
    throw err
  }
  console.log(keypair.unmarshal(pair.marshal()).certificate.toString())
})*/

/*
let distance = (nodeA, nodeB) => {
  return hamming(nodeA, nodeB)
}*/
//console.log(new Buffer('01','binary').toString('hex'))
//console.log(util.intToBuffer(23338956131).toString('hex'))

let peers= []
let nodeId= util.hash(crypto.randomBytes(34))
let bucket= new Bucket(nodeId,20)
/*
for(let i = 0; i < (nodeId.length * 8); i++){
  console.log(bucket.getBit(nodeId, i))
}
*/


for(let i= 0; i < 42; i++ ){
  let peer =new Peer(util.hash(crypto.randomBytes(34)), randomIp() ,randomInt(1, 68000))
  peers.push(peer)
  bucket.add(peer)
}
console.log(bucket.toString())
let peer = bucket.toArray().pop()
console.log(peer.toString())
let peer2 = bucket.get(peer.id)
console.log(peer2.toString())


