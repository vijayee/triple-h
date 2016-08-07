'use strict'
const Node = require('./node')
const Bucket = require('./bucket')
const Peer = require('./peer')
const util = require('./utility.js')
const hamming = require('hamming-distance')
const randomIp = require('random-ipv4')
const randomInt = require('random-int')
const crypto = require('crypto')


//console.log(util.hash(crypto.randomBytes(34)).length)


let node = new Node('triple-h')
node.on('error', (err)=>{console.log(err)})
node.on('ready', (info)=>{console.log(info.toString())})

/*
let distance = (nodeA, nodeB) => {
  return hamming(nodeA, nodeB)
}*/
//console.log(new Buffer('01','binary').toString('hex'))
//console.log(util.intToBuffer(23338956131).toString('hex'))
/*
let peers= []
let nodeId= util.hash(crypto.randomBytes(34))
let bucket= new Bucket(nodeId,20)
/*
for(let i = 0; i < (nodeId.length * 8); i++){
  console.log(bucket.getBit(nodeId, i))
}
*/

/*
for(let i= 0; i < 42; i++ ){
  let peer =new Peer(util.hash(crypto.randomBytes(34)), randomIp() ,randomInt(1, 68000))
  peers.push(peer)
  bucket.add(peer)
}
console.log(bucket.toString())
let peer = bucket.toArray()[0]
console.log(peer.toString())
let peer2 = bucket.get(peer.id)
console.log(peer2.toString())
*/
