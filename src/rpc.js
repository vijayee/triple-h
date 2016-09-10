'use strict'
const protobuf = require('protobufjs')
const crypto = require('crypto')
const increment = require('increment-buffer')
const path = require('path')
const file = path.join(__dirname, '/proto/', 'rpc.proto')
const builder = protobuf.loadProtoFile(file)
const RPCProto = builder.build('RPCProto')
const FindNodeRequest = RPCProto.FindNodeRequest
const FindNodeResponse = RPCProto.FindNodeResponse
const FindValueRequest = RPCProto.FindValueRequest
const FindValueResponse = RPCProto.FindValueResponse
const RPCType = RPCProto.RPCType
const Direction = RPCProto.Direction
const Status = RPCProto.Status
const config = require('../config.js')
const Peer = require('./peer.js')
let _messenger = new WeakMap()
let _requests = new WeakMap()
let _peer = new WeakMap()
let _rpcid = new WeakMap()
let _bucket = new WeakMap()
let _putValue = new WeakMap()
let _getValue = new WeakMap()
/*
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
 */
function noPut (val, cb) {
  process.nextTick(()=> {
    return cb(new Error("No put method defined"))
  })
}
function noGet (hash, cb) {
  process.nextTick(()=> {
    return cb(new Error("No put method defined"))
  })
}
function sanitizeRPC (rpc) {
  try {
    rpc.id = rpc.id.toBuffer()
    rpc.from.id = rpc.from.id.toBuffer()
    rpc.from.port = rpc.from.port.toNumber()
    if (rpc.payload) {
      rpc.payload = rpc.payload.toBuffer()
    }
  } catch (ex) {

  }
}
function sanitizeFindNodeRequest (req) {
  try {
    req.id = req.id.toBuffer()
    req.count = req.count.toNumber()
  } catch (ex) {

  }
}
function sanitizePeer (peer) {
  try {
    peer.id = peer.id.toBuffer()
    peer.port = peer.port.toNumber()
  } catch (ex) {

  }
}
function sanitizeValueResponse (value) {
  try {
    value.hash = value.hash.toBuffer()
    value.data = value.data.toBuffer()
  } catch (ex) {

  }
}
function sanitizeValueRequest (value) {
  try {
    value.hash = value.hash.toBuffer()
    value.count = value.count.toNumber()
  } catch (ex) {

  }
}
module.exports = class RPC {
  constructor (peer, messenger, bucket, getValue, putValue) {
    _requests.set(this, new Map())
    _bucket.set(this, bucket)
    _peer.set(this, peer)
    _messenger.set(this, messenger)
    if (!getValue) {
      getValue = noGet
    }
    if (!putValue) {
      putValue = noPut
    }
    _putValue.set(this, putValue)
    _getValue.set(this, getValue)
    _rpcid.set(this, crypto.randomBytes(2))
    let pingResponse = (pb)=> {
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.comType = Direction.Response
      responsepb.from = peer.toJSON()
      let response = new RPCProto.RPC(responsepb).encode().toBuffer()
      messenger.send(response, pb.from.ip, pb.from.port)
    }
    let findNodeResponse = (pb)=> {
      let nodepb = FindNodeRequest.decode(pb.payload)
      sanitizeFindNodeRequest(nodepb)
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.comType = Direction.Response
      responsepb.from = peer.toJSON()
      let peers = bucket.closest(nodepb.id, nodepb.count)
      let peerspb = peers.map((peer)=> {return peer.toJSON()})
      let payload = FindNodeResponse.encode({ nodes: peerspb })
      responsepb.payload = payload
      responsepb.status = Status.Success
      let response = new RPCProto.RPC(responsepb).encode().toBuffer()
      messenger.send(response, pb.from.ip, pb.from.port)
    }
    let findValueResponse = (pb)=> {
      let valuepb = FindValueRequest.decode(pb.payload)
      sanitizeValueRequest(valuepb)
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.comType = Direction.Response
      responsepb.from = peer.toJSON()
      getValue(valuepb.hash, (err, value)=> {
        if (err) {
          let peers = bucket.closest(valuepb.hash, valuepb.count)
          let valueRespb = { hash: valuepb.hash, nodes: peers }
          let payload = new FindValueResponse(valueRespb).encode().toBuffer()
          responsepb.payload = payload
          responsepb.status = Status.Failure
          messenger.send(response, pb.from.ip, pb.from.port)
        } else {
          let valueRespb = { hash: valuepb.hash, data: value, nodes: [] }
          let payload = new FindValueResponse(valueRespb).encode().toBuffer()
          responsepb.payload = payload
          responsepb.status = Status.Success
          let response =  new RPCProto.RPC(responsepb).encode().toBuffer()
          messenger.send(response, pb.from.ip, pb.from.port)
        }
      })
    }
    let storeResponse = (pb)=> {
      let value = pb.payload
      let responsepb = {}
      responsepb.id = pb.id
      responsepb.type = pb.type
      responsepb.comType = Direction.Response
      responsepb.from = peer.toJSON()
      putValue(value, (err)=> {
        if (err) {
          responsepb.status = Status.Failure
        } else {
          responsepb.status = Status.Success
        }
        let response = new RPCProto.RPC(responsepb).encode().toBuffer()
        messenger.send(response, pb.from.ip, pb.from.port)
      })

    }
    // This takes a request and creates an appropriate response for its type
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
      let key = pb.id.toString('hex')
      let request = requests.get(key)
      if (!request) {
        return
      }
      clearTimeout(request.timer)
      let bucket = _bucket.get(this)
      request.resCount++
      let nodespb = FindNodeResponse.decode(pb.payload)
      let nodes = request.nodes
      let peers = []
      nodespb.nodes.forEach((peer)=> {
        sanitizePeer(peer)
        peer = new Peer(peer.id, peer.ip, peer.port)
        peers.push(peer)
        bucket.add(peer)
      })
      nodes = peers.concat(nodes)
      if (request.resCount >= config.nodeCount) {
        requests.delete(key)
        _requests.set(this, requests)
        return process.nextTick(request.cb)
      } else {
        let queried = request.queried
        let isSending = (nodes.length > 0) && (queried.length < config.nodeCount)
        for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount && queried.length < config.nodeCount; i++) {
          let node = nodes.shift()
          while (queried.find((peer)=> {return peer.id === node.id})) {
            node = nodes.shift()
          }
          queried.push(node)
          messenger.send(request.req, node.ip, node.port)
        }

        if (isSending) {
          let timer = setTimeout(()=> {
            let requests = _requests.get(this)
            let request = requests.get(key)
            if (request) {
              requests.delete(key)
              _requests.set(this, requests)
              process.nextTick(()=> {
                return request.cb(new Error("Find Node Timed Out"))
              })
            }
          }, config.timeout)
          request.timer = timer
        }
        request.queried = queried
        request.nodes = nodes
        requests.set(key, request)
        _requests.set(this, requests)
      }
    }

    let pingRequest = (pb)=> {
      let requests = _requests.get(this)
      let key = pb.id.toString('hex')
      let request = requests.get(key)
      if (!request) {
        return
      }
      clearTimeout(request.timer)
      requests.delete(key)
      _requests.set(this, requests)
      return process.nextTick(request.cb)
    }

    let findValueRequest = (pb)=> {
      let requests = _requests.get(this)
      let key = pb.id.toString('hex')
      let request = requests.get(key)
      if (!request) {
        return
      }
      clearTimeout(request.timer)
      let bucket = _bucket.get(this)
      request.resCount++
      let valuespb = FindValueResponse.decode(pb.payload)

      sanitizeValueResponse(valuespb)
      let nodes = request.nodes
      let peers = []
      if (valuespb.data) {
        requests.delete(key)
        _requests.set(this, requests)
        return process.nextTick(()=> {
          return request.cb(null, valuespb.data)
        })
      }
      valuespb.nodes.forEach((peer)=> {
        sanitizePeer(peer)
        peer = new Peer(peer.id, peer.ip, peer.port)
        peers.push(peer)
        bucket.add(peer)
      })
      nodes = peers.concat(nodes)
      if (request.resCount >= nodes.length) {
        requests.delete(key)
        _requests.set(this, requests)
        return process.nextTick(()=>{
          return request.cb(new Error("Value Not Found"))
        })
      } else {
        let queried = request.queried
        let isSending = (nodes.length > 0) && (queried.length < config.nodeCount)
        for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount && queried.length < config.nodeCount; i++) {
          let node = nodes.shift()
          while (queried.find((peer)=> {return peer.id === node.id})) {
            node = nodes.shift()
          }
          queried.push(node)
          messenger.send(request.req, node.ip, node.port)
        }
        if (isSending) {
          let timer = setTimeout(()=> {
            let requests = _requests.get(this)
            let request = requests.get(key)
            if (request) {
              requests.delete(key)
              _requests.set(this, requests)
              process.nextTick(()=> {
                return request.cb(new Error("Find Value Timed Out"))
              })
            }
          }, config.timeout)
          request.timer = timer
        }
        request.queried = queried
        request.nodes = nodes
        requests.set(key, request)
        _requests.set(this, requests)
      }
    }

    let storeRequest = (pb)=> {
      let requests = _requests.get(this)
      let key = pb.id.toString('hex')
      let request = requests.get(key)
      if (!request) {
        return
      }
      clearTimeout(request.timer)
      let bucket = _bucket.get(this)
      request.resCount++


      let nodes = request.nodes
      let peers = []
      if (pb.Status = Status.Success && request.resCount >= config.storeCount) {
        requests.delete(key)
        _requests.set(this, requests)
        return process.nextTick(request.cb)
      }
      if (request.resCount >= nodes.length) {
        requests.delete(key)
        _requests.set(this, requests)
        return process.nextTick(()=>{
          return request.cb(new Error("Value Not Stored"))
        })
      } else {
        let queried = request.queried
        let isSending = (nodes.length > 0) && (queried.length < config.storeCount)
        for (let i = 0; i < config.concurrency && i < nodes.length && i < config.storeCount && queried.length < config.storeCount; i++) {
          let node = nodes.shift()
          while (queried.find((peer)=> {return peer.id === node.id})) {
            node = nodes.shift()
          }
          queried.push(node)
          messenger.send(request.req, node.ip, node.port)
        }
        if (isSending) {
          let timer = setTimeout(()=> {
            let requests = _requests.get(this)
            let request = requests.get(key)
            if (request) {
              requests.delete(key)
              _requests.set(this, requests)
              process.nextTick(()=> {
                return request.cb(new Error("Find Value Timed Out"))
              })
            }
          }, config.timeout)
          request.timer = timer
        }
        request.queried = queried
        request.nodes = nodes
        requests.set(key, request)
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
      let pb = RPCProto.RPC.decode(msg)
      sanitizeRPC(pb)
      if (pb) {
        switch (pb.comType) {
          case Direction.Response :
            handleResponse(pb)
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
    let messenger = _messenger.get(this)
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Find_Node
    requestpb.comType = Direction.Request
    requestpb.from = peer.toJSON()
    let findnodepb = {}
    findnodepb.id = id
    findnodepb.count = config.nodeCount
    let payload = new FindNodeRequest(findnodepb).encode().toBuffer()
    requestpb.payload = payload
    let request = new RPCProto.RPC(requestpb).encode().toBuffer()
    let nodes = bucket.closest(id, config.nodeCount)
    let queried = []
    for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount && queried.length < config.nodeCount; i++) {
      let node = nodes.shift()
      queried.push(node)
      messenger.send(request, node.ip, node.port)
    }
    let key = requestpb.id.toString('hex')
    let timer = setTimeout(()=> {
      let requests = _requests.get(this)
      let request = requests.get(key)
      if (request) {
        requests.delete(key)
        _requests.set(this, requests)
        process.nextTick(()=> {
          return request.cb(new Error("Find Node Timed Out"))
        })
      }
    }, config.timeout)
    requests.set(key, { req: request, resCount: 0, cb: cb, nodes: nodes, queried: queried, timer: timer })
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)

  }

  findValue (hash, cb) {
    let messenger = _messenger.get(this)
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Find_Value
    requestpb.comType = Direction.Request
    requestpb.from = peer.toJSON()
    let findvaluepb = {}
    findvaluepb.hash = hash
    findvaluepb.count = config.nodeCount
    let payload = new FindValueRequest(findvaluepb).encode().toBuffer()
    requestpb.payload = payload
    let request = new RPCProto.RPC(requestpb).encode().toBuffer()
    let nodes = bucket.closest(hash, config.nodeCount)
    let queried = []
    for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount && queried.length < config.nodeCount; i++) {
      let node = nodes.shift()
      queried.push(node)
      messenger.send(request, node.ip, node.port)
    }
    let key = requestpb.id.toString('hex')
    let timer = setTimeout(()=> {
      let requests = _requests.get(this)
      let request = requests.get(key)
      if (request) {
        requests.delete(key)
        _requests.set(this, requests)
        process.nextTick(()=> {
          return request.cb(new Error("Find Value Timed Out"))
        })
      }
    }, config.timeout)
    requests.set(key, { req: request, resCount: 0, cb: cb, nodes: nodes, queried: queried, timer: timer })
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)

  }

  ping (id, cb) {
    let messenger = _messenger.get(this)
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let to = bucket.get(id)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Ping
    requestpb.comType = Direction.Request
    requestpb.from = peer.toJSON()
    let request = new RPCProto.RPC(requestpb).encode().toBuffer()
    messenger.send(request, to.ip, to.port)
    let key = requestpb.id.toString('hex')
    let timer = setTimeout(()=> {
      let requests = _requests.get(this)
      let request = requests.get(key)
      let bucket = _bucket.get(this)
      bucket.remove(to)
      _bucket.set(this, bucket)
      if (request) {
        requests.delete(key)
        _requests.set(this, requests)
        process.nextTick(()=> {
          return request.cb(new Error("Ping Timed Out"))
        })
      }
    }, config.timeout)
    requests.set(key, { req: request, cb: cb, timer: timer })
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)
  }

  store (hash, value, cb) {
    let messenger = _messenger.get(this)
    let peer = _peer.get(this)
    let rpcid = _rpcid.get(this)
    let bucket = _bucket.get(this)
    let requests = _requests.get(this)
    let requestpb = {}
    requestpb.id = rpcid.slice(0)
    requestpb.type = RPCType.Store
    requestpb.comType = Direction.Request
    requestpb.from = peer.toJSON()
    requestpb.payload = value
    let request = new RPCProto.RPC(requestpb).encode().toBuffer()
    let nodes = bucket.closest(hash, config.nodeCount)
    let queried = []
    for (let i = 0; i < config.concurrency && i < nodes.length && i < config.nodeCount; i++) {
      let node = nodes.shift()
      queried.push(node)
      messenger.send(request, node.ip, node.port)
    }
    requests.set(requestpb.id.toString('hex'), { req: request, resCount: 0, cb: cb, nodes: nodes, stored: queried })
    _requests.set(this, requests)
    rpcid = increment(rpcid)
    _rpcid.set(this, rpcid)
  }

  connect (peer, cb) {
    let bucket = _bucket.get(this)
    bucket.add(peer)
    this.ping(peer.id, (err)=> {
      if (err) {
        return process.nextTick(()=> {
          return cb(new Error("Failed to connect"))
        })
      }
      return process.nextTick(cb)
    })
  }
}