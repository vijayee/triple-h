const Node = require('./node')

let node = new Node('triple-h')
node.on('error', (err)=>{console.log(err)})
node.on('ready', (info)=>{console.log(info)})
