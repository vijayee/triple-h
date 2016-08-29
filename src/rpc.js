'use strict'
const protobuf = require('protocol-buffers')
const crypto = require('crypto')
const increment = require('increment-buffer')
const rpcproto = protobuf(fs.readFileSync('./proto/rpc.proto'))
const config = require('../config.js')
const Peer = require('../peer.js')
let _requests = new WeakMap()
let _peer = new WeakMap()
let _rpcid = new WeakMap()
let _bucket = new WeakMap()
let _putValue = new WeakMap()
let RPCType = {}
RPCType.Ping = 1
RPCType.Find_Node = 2
RPCType.Find_Value = 3
RPCType.Store = 4
let Direction = {}
Direction.Response = 1;
Direction.Request = 2;
let Status = {}
Status.Success = 1;
Status.Failure = 2;
function noPut(val,cb){
  process.nextTick(()=>{
    return cb(new Error("No put method defined"))
  })
}
function noGet(hash, cb){
  process.nextTick(()=>{
    return cb(new Error("No put method defined"))
  })
}

class RPC {
  constructor (peer, messenger, bucket, getValue, putValue) {
    _requests.set(this, new Map())
    _bucket.get(this, bucket)
    _peer.set(this, peer)
    if(!getValue){
      getValue= noGet
    }
    if(!putValue){
      putValue= noPut
    }
    _putValue.set(this, putValue)
    _getValue.set(this, getValue)
    _rpcid.set(this, crypto.randomBytes(2))
    let pingResponse = (pb)=> {
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      let response = rpcproto.RPC.encode(responsepb)
      messenger.send(response, pb.from.ip, pb.from.port)
    }
    let findNodeResponse = (pb)=> {
      let nodepb = rpcproto.FindNodeRequest.decode(pb.payload)
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      let peers = bucket.closest(nodepb.id, nodepb.count)
      let peerspb = peers.map((peer)=> {return peer.toJSON()})
      let payload = rpcproto.FindNodeResponse.encode({ nodes: peerspb })
      responsepb.payload = payload
      responsepb.status = Status.Success
      let response = rpcproto.RPC.encode(responsepb)
      messenger.send(response, pb.from.ip, pb.from.port)
    }
    let findValueResponse = (pb)=> {
      let valuepb = rpcproto.FindValueRequest.decode(pb.payload)
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      getValue(valuepb.hash, (err, value)=> {
        if (err) {
          let peers = bucket.closest(valuepb.hash, valuepb.count)
          let valueRespb = { hash: valuepb.hash, peers: peers }
          let payload = rpcproto.FindValueResponse.encode(valueRespb)
          responsepb.payload = payload
          responsepb.status = Status.Success
          messenger.send(response, pb.from.ip, pb.from.port)
        } else {
          let valueRespb = { hash: valuepb.hash, data: value, peers: [] }
          let payload = rpcproto.FindValueResponse.encode(valueRespb)
          responsepb.payload = payload
          responsepb.status = Status.Success
          messenger.send(response, pb.from.ip, pb.from.port)
        }
      })
    }
    let storeResponse = (pb)=> {
      let valuepb = rpcproto.Value.decode(pb.payload)
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.direction = Direction.Response
      responsepb.from = peer.toJSON()
      putValue(valuepb.data, (err)=> {
        if (err) {
          responsepb.status = Status.Failure
        } else {
          responsepb.status = Status.Success
        }
        let response = rpcproto.RPC.encode(responsepb)
        messenger.send(response, pb.from.ip, pb.from.port)
      })

    }
    let handleRequest = (pb)=> {
      let bucket = _bucket.get(this)
      bucket.add(new Peer(pb.from.id, pb.from.ip, pb.from.port))
      _bucket.set(this, bucket)
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

    let findNodeRequest = (pb)=> {
      let requests = _requests.get(this)
      let request = requests.get(pb.id.toString('hex'))
      if (!request) {
        return
      }
      let bucket = bucket.get(this)
      request.resCount++
      let nodespb = rcproto.FindNodeResponse.decode(pb.payload)
      let nodes = request.nodes
      let peers = []
      nodespb.nodes.forEach((peer)=> {
        let peer = new Peer(peer.id, peer.ip, peer.port)
        peers.push(peer)
        bucket.add(peer)
      })
      let nodes = peers.concat(nodes)
      if (request.resCount >= config.nodeCount) {
        requests.delete(pb.id.toString('hex'))
        _requests.set(this, requests)
        return process.nextTick(request.cb)
      } else {
        let queried = request.queried
        for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount; i++) {
          let node = nodes.shift()
          while (queried.find((peer)=> {return peer.id === node.id})) {
            node = nodes.shift()
          }
          queried.push(node)
          messenger.send(request.req, node.ip, node.port)
        }
        request.queried = queried
        request.nodes = nodes
        requests.set(pb.id.toString('hex'), request)
        _requests.set(this, requests)
      }
    }

    let pingRequest = (pb)=> {
      let requests = _requests.get(this)
      let request = requests.get(pb.id.toString('hex'))
      if(!request){
        return
      }
      clearTimeout(request.timer)
      requests.delete(pb.id.toString('hex'))
      _requests.set(this, requests)
      return process.nextTick(request.cb)
    }

    let findValueRequest = (pb)=>{
      let requests = _requests.get(this)
      let request = requests.get(pb.id.toString('hex'))
      if (!request) {
        return
      }
      let bucket = bucket.get(this)
      request.resCount++
      let valuespb = rcproto.FindValueResponse.decode(pb.payload)
      let nodes = request.nodes
      let peers = []
      if(valuespb.data){
        requests.delete(pb.id.toString('hex'))
        _requests.set(this, requests)
        return process.nextTick(()=>{
          return request.cb(data)
        })
      }
      valuespb.nodes.forEach((peer)=> {
        let peer = new Peer(peer.id, peer.ip, peer.port)
        peers.push(peer)
        bucket.add(peer)
      })
      let nodes = peers.concat(nodes)
      if (request.resCount >= config.nodeCount) {
        requests.delete(pb.id.toString('hex'))
        _requests.set(this, requests)
        return process.nextTick(request.cb)
      } else {
        let queried = request.queried
        for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount; i++) {
          let node = nodes.shift()
          while (queried.find((peer)=> {return peer.id === node.id})) {
            node = nodes.shift()
          }
          queried.push(node)
          messenger.send(request.req, node.ip, node.port)
        }
        request.queried = queried
        request.nodes = nodes
        requests.set(pb.id.toString('hex'), request)
        _requests.set(this, requests)
      }
    }

    let handleResponse = (pb)=> {
      switch (pb.type) {
        case RPCType.Ping :
          pingRequest(pb)
          break;
        case RPCType.Find_Node :
          findNodeRequest(pb)
          break;
        case RPCType.Find_Value :
          findValueRequest(pb)
          break;
        case RPCType.Store :
          storeRequest(pb)
          break;
      }

    }
    let onmessage = (msg)=> {
      let pb = rpcproto.RPC.decode(msg)
      if (pb) {
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

    let ondropped = ()=> {}
    messenger.on('dropped', ondropped)
  }

  findNode (id, cb) {
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Find_Node
    requestpb.direction = Direction.Request
    requestpb.from = peer.toJSON()
    let findnodepb={}
    findnodepb.id = id
    findnodepb.count = config.nodeCount
    let payload = rpcproto.FindValueRequest.encode(findnodepb)
    requestpb.payload= payload
    let request = rpcproto.RPC.encode(requestpb)
    let nodes = bucket.closest(id, config.nodeCount)
    let queried = []
    for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount; i++) {
      let node = nodes.shift()
      queried.push(node)
      messenger.send(request, node.ip, node.port)
    }
    requests.set(requestpb.id.toString('hex'), { req: request, resCount: 0, cb: cb, nodes: nodes, queried: queried })
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)

  }

  findValue (hash, cb) {
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Find_Value
    requestpb.direction = Direction.Request
    requestpb.from = peer.toJSON()
    let findvaluepb={}
    findvaluepb.hash = hash
    findvaluepb.count = config.nodeCount
    let payload = rpcproto.FindValueRequest.encode(findvaluepb)
    requestpb.payload= payload
    let request = rpcproto.RPC.encode(requestpb)
    let nodes = bucket.closest(hash, config.nodeCount)
    let queried = []
    for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount; i++) {
      let node = nodes.shift()
      queried.push(node)
      messenger.send(request, node.ip, node.port)
    }
    requests.set(requestpb.id.toString('hex'), { req: request, resCount: 0, cb: cb, nodes: nodes, queried: queried })
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)

  }

  ping (id, cb) {
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let to = bucket.get(id)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Ping
    requestpb.direction = Direction.Request
    requestpb.from = peer.toJSON()
    let request = rpcproto.RPC.encode(requestpb)
    messenger.send(request, to.ip, to.port)
    let key = requestpb.id.toString('hex')
    let timer = setTimeout(()=>{
      let requests = _requests.get(this)
      let request = request.get(key)
      if (request){
        requests.delete(key)
        _requests.set(this, requests)
        process.nextTick(()=>{
          return request.cb(new Error("Ping Timed Out"))
        })
      }
    }, config.timeout)
    requests.set(key, { req: request, cb: cb , timer: timer})
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)
  }

  store (hash, value, cb) {
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Store
    requestpb.direction = Direction.Request
    requestpb.from = peer.toJSON()
    requestpb.payload = value
    let request = rpcproto.RPC.encode(requestpb)
    let nodes = bucket.closest(hash, config.nodeCount)
    let queried = []
    for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount; i++) {
      let node = nodes.shift()
      queried.push(node)
      messenger.send(request, node.ip, node.port)
    }
    requests.set(requestpb.id.toString('hex'), { req: request, resCount: 0, cb: cb, nodes: nodes, queried: queried })
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)
  }

}