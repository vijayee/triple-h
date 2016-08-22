'use strict'
const protobuf = require('protocol-buffers')
const crypto = require('crypto')
const increment= require('increment-buffer')
const rpcproto = protobuf(fs.readFileSync('./proto/rpc.proto'))
const config =require('../config.js')
let _requests = new WeakMap()
let _peer = new WeakMap()
let _rpcid = new WeakMap()
let _bucket = new WeakMap()
let RPCType={}
RPCType.Ping = 1
RPCType.Find_Node = 2
RPCType.Find_Value= 3
RPCType.Store= 4
let Direction = {}
Direction.Response = 1;
Direction.Request = 2;
let Status = {}
Status.Success = 1;
Status.Failure = 2;

class RPC{
  constructor(peer, messenger, bucket, getValue, putValue){
    _requests.set(this, new Map())
    _bucket.get(this, bucket)
    _peer.set(this, peer)
    _rpcid.set(this, crypto.randomBytes(2))
    let pingResponse = (pb)=>{
      let responsepb={}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      let response = rpcproto.RPC.encode(responsepb)
      messenger.send(response, pb.from.ip, pb.from.port)
    }
    let findNodeResponse = (pb)=>{
      let nodepb = rpcproto.FindNodeRequest.decode(pb.payload)
      let responsepb={}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      let peers = bucket.closest(nodepb.id, nodepb.count)
      let peerspb = peers.map((peer)=>{return peer.toJSON()})
      let payload = rpcproto.FindNodeResponse.encode({nodes: peerspb})
      responsepb.payload= payload
      responsepb.status= Status.Success
      let response = rpcproto.RPC.encode(responsepb)
      messenger.send(response, pb.from.ip, pb.from.port)
    }
    let findValueResponse = (pb)=>{
      let valuepb = rpcproto.FindValueRequest.decode(pb.payload)
      let responsepb={}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      getValue(valuepb.hash,(err, value)=>{
        if(err){
          let peers = bucket.closest(valuepb.hash, valuepb.count)
          let valueRespb = { hash: valuepb.hash, peers: peers }
          let payload =  rpcproto.FindValueResponse.encode(valueRespb)
          responsepb.payload= payload
          responsepb.status= Status.Success
          messenger.send(response, pb.from.ip, pb.from.port)
        } else {
          let valueRespb = { hash: valuepb.hash, data: value, peers:[] }
          let payload =  rpcproto.FindValueResponse.encode(valueRespb)
          responsepb.payload= payload
          responsepb.status= Status.Success
          messenger.send(response, pb.from.ip, pb.from.port)
        }
      })
    }
    let storeResponse = (pb)=>{
      let valuepb = rpcproto.Value.decode(pb.payload)
      let responsepb={}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      putValue(valuepb.data, (err)=>{
        if(err){
          responsepb.status = Status.Failure
        } else{
          responsepb.status = Status.Success
        }
        let response = rpcproto.RPC.encode(responsepb)
        messenger.send(response, pb.from.ip, pb.from.port)
      })

    }
    let handleRequest =(pb)=>{
      switch (pb.type) {
        case RPCType.Ping :
          pingResponse(pb)
          break;
        case RPCType.Find_Node :
          findNodeResponse(pb)
          break;
        case RPCType.Find_Value :
          findValueResponse(pb)
          break;
        case RPCType.Store :
          storeResponse(pb)
          break;
      }
    }
    let handleResponse =(pb)=>{

    }
    let onmessage=(msg)=>{
      let pb = rpcproto.RPC.decode(msg)
      if(pb) {
        switch (pb.commType) {
          case Direction.Response :
            handleReponse(pb)
            break;
          case Direction.Request :
            handleRequest(pb)
            break;
        }
      }
    }
    messenger.on('message', onmessage)
    
    let ondropped= ()=>{}
    messenger.on('dropped', ondropped)
  }
  findNode(id, cb){
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket=  _bucket.get(this)
    let requests = _requests.get(this)
    let to = bucket.get(id)
    let requestpb={}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Ping
    requestpb.direction = Direction.Request
    requestpb.from = peer.toJSON()
    let request = rpcproto.RPC.encode(requestpb)
    let nodes = bucket.closest(id, config.nodeCount)
    let i= -1
    let next = ()=>{}
    nodes.length
    requests.set(requestpb.id.toString('hex'), {req: request, cb: cb, nodes: nodes})
    _requests.set(this, requests)
    messenger.send(request, to.ip, to.port)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)

  }
  findValue(hash,cb){

  }

  ping(id,cb){
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket=  _bucket.get(this)
    let requests = _requests.get(this)
    let to = bucket.get(id)
    let requestpb={}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Ping
    requestpb.direction = Direction.Request
    requestpb.from = peer.toJSON()
    let request = rpcproto.RPC.encode(requestpb)
    requests.set(requestpb.id.toString('hex'), {req: request, cb: cb})
    _requests.set(this, requests)
    messenger.send(request, to.ip, to.port)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)
  }
  store(value, cb){

  }

}