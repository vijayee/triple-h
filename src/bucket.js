'use strict'
const EventEmitter = require('events').EventEmitter
const hamming = require('hamming-distance')
let _size = new WeakMap()
let _nodeId = new WeakMap()
let _left = new WeakMap()
let _right = new WeakMap()
let _bucket = new WeakMap()
let _nodeId = new WeakMap()
let _root = new WeakMap()
let _capped = new WeakMap()
let Peer = require('./peer.js')
module.exports = class Bucket extends EventEmitter {
  constructor (nodeId, size, root) {
    super(this)
    _bucket.set(this, [])
    _nodeId.set(this, nodeId)
    _size.set(this, size)
    _root.set(this, root || this)
    _capped.set(this, false)
  }

  get size () {
    return _size.get(this)
  }

  get bucket () {
    let bucket = _bucket.get(this)
    if (bucket) {
      return bucket.slice(0)
    } else {
      return null
    }
  }

  static distance (nodeA, nodeB) {
    return hamming(nodeA, nodeB)
  }

  cap () {
    _capped.set(this, true)
  }

  get capped () {
    return _capped.get(this)
  }

  getBit (peerId, index) {
    if (!index) {
      index = 0
    }
    let byte = parseInt(index / 8, 10)
    let byteIndex = index % 8
    if ((peerId.length < byte) && (byteIndex !== 0)) {
      return false
    }
    if (peerId[ byte ] & Math.pow(2, (7 - byteIndex))) {
      return true
    } else {
      return false
    }
  }

  add (peer, index) {
    if (!(peer instanceof Peer)) {
      throw new Error('Invalid Peer')
    }
    if (!index) {
      index = 0
    }
    if (!isNaN(index)) {
      throw new Error('Invalid index')
    }
    let bucket = _bucket.get(this)
    if (bucket) {
      let found = bucket.find((known)=> { return known.id.compare(peer.id) === 0})
      if (found) {
        this.update(peer)
      } else {
        let size = _size.get(this)
        if (bucket.length < size) {
          bucket.push(peer)
          _bucket.set(this, bucket)
        } else {
          if (this.capped) {
            let root = _root.get(this)
            root.emit('ping', bucket.slice(0), peer)
          } else {
            this.split()
            this.add(peer)
          }
        }
      }
    } else {
      if (this.getBit(peer.id, index++)) {
        let right = _right.get(this)
        right.add(peer, index)
        _right.set(this, right)
      } else {
        let left = _left.get(this)
        left.add(peer, index)
        _left.set(this, left)
      }
    }
  }

  update (peer) {
    let bucket = _bucket.get(this)
    bucket = bucket.filter((known)=> { return known.id.compare(peer.id) !== 0})
    bucket.push(peer)
    _bucket.set(bucket)
  }

  remove (peer, index) {
    if (!index) {
      index = 0
    }
    let bucket = _bucket.get(this)
    if (bucket) {
      bucket = bucket.filter((known)=> { return known.id.compare(peer.id) !== 0})
      _bucket.set(bucket)
      let root = _root.get(this)
      root.emit('removed', peer)
    } else {
      if (this.getBit(peer.id, index++)) {
        let right = _right.get(this)
        right.remove(peer, index)
      } else {
        let left = _left.get(this)
        left.remove(peer, index)
      }
    }
  }

  split (index) {
    if (!index) {
      index = 0
    }
    let bucket = _bucket.get(this)
    let size = _size.get(this)
    if (bucket.length < size) {
      return
    }
    let root = _root.get(this)
    let nodeId = _nodeId.get(this)

    let right = new Bucket(nodeId, size, root)
    let left = new Bucket(nodeId, size, root)

    for (let i = 0; i < bucket.length; i++) {
      let peer = bucket[ i ]
      if (this.getBit(peer.id, index)) {
        right.add(peer, index)
      } else {
        left.add(peer, index)
      }
    }
    if (this.getBit(nodeId, index)) {
      right.cap()
    } else {
      left.cap()
    }
    bucket = null
    _bucket.set(bucket)
    _right.set(this, right)
    _left.set(this, left)

  }

  closest (id, count, index) {
    if (!index) {
      index = 0
    }
    let bucket = _bucket.get(this)
    if (bucket) {
      return bucket.map((peer)=> {
          peer.distance = Bucket.distance(peer.id, id)
          return peer
        })
        .sort((a, b)=> {
          return a.distance - b.distance
        })
        .slice(0, count)
    } else {
      let peers
      if (getBit(id, index++)) {
        let right = _right.get(this)
        peers = right.closest(id, count, index)
        if (peers.length < count) {
          let left = _left.get(this)
          peers = peers.concat(left.closest(id, count, index))
        }
      } else {
        let left = _left.get(this)
        peers = left.closest(id, count, index)
        if (peers.length < count) {
          let right = _right.get(this)
          peers = peers.concat(right.closest(id, count, index))
        }
      }
      return peers.slice(0, count)
    }
  }
}
