'use strict'
const fs = require('fs')
const path = require('path')
const EventEmitter = require('events').EventEmitter
const natPMP = require('nat-pmp')
const p2pCrypto = require('libp2p-crypto')
const Peer = require('./peer.js')
const config = require('../config.js')
const multihashing = require('multihashing')
const network = require('network')
const mkdirp = require('mkdirp')
let _platformPath = new WeakMap()
let _applicationName = new WeakMap()
let _keyPair = new WeakMap()
let _peerInfo = new WeakMap()
let _client = new WeakMap()
const fileName = 'node.hhh'
module.exports = class Node extends EventEmitter {
  constructor (applicationName) {
    super()
    if (typeof applicationName !== 'string') {
      throw new Error('Application name must be a string')
    }
    _applicationName.set(this, applicationName)
    if (/^win/.test(process.platform)) {
      _platformPath.set(this, path.join(process.env['SystemDrive'], '/ProgramData/.triple-h'))
    } else if (/^darwin/.test(process.platform)) {
      _platformPath.set(this, '/Library/Application Support/.triple-h')
    } else {
      _platformPath.set(this, '~/.triple-h')
    }
    let appFolder = path.join(_platformPath.get(this), applicationName)
    mkdirp(appFolder, (err)=> {
      if (err) {
        return this.emit(err)
      }
      let keyPair
      let node = fs.readFile(path.join(appFolder, 'node'), (err, node)=> {
        let getNetwork = (err)=> {
          if (err) {
            return this.emit('error', err)
          }
          network.get_gateway_ip((err, ip) => {
            if (err) {
              return this.emit('error', err)
            }
            let client = natPMP.connect(ip)
            _client.set(this, client)
            let port = config.startPort
            let tries = -1
            let opts = { type: 'udp', private: port, public: port }
            let findPort = (err, info)=> {
              if (err) {

              } else {
              }
            }
            let getPeer= (err, ip)=>{
              let pk = keyPair.public.marshal()
              let id = multihashing(pk, 'sha2-256')
              _peerInfo.set(this, new Peer(id, ip, port))
              this.emit('ready', { id: id, ip: ip, port: port })
            }
            network.get_public_ip((err, ip)=> {
              if(err){
               this.emit('error', err)
                return network.get_private_ip(getPeer)
              }
              getPeer(err,ip)
            })

          })
        }
        if (err) {
          keyPair = p2pCrypto.generateKeyPair('RSA', 2048)
          _keyPair.set(this, keyPair)
          let node = p2pCrypto.marshalPrivateKey(keyPair, 'RSA')
          fs.writeFile(path.join(appFolder, 'node'), node , getNetwork)
        } else {
          keyPair = p2pCrypto.unmarshalPrivateKey(node)
          if (keyPair) {
            _keyPair.set(this, keyPair)
            getNetwork()
          } else {
            this.emit('error', new Error('Invalid node key pair'))
          }
        }
      })

    })

  }
}
