# ByteArray Node

A Node.js implementation of the Actionscript 3 ByteArray based on this package : https://www.npmjs.com/package/bytearray-node

# Installation

`npm install bytearray-node-as3`

# Usage

```js
import { ByteArray } from "bytearray-node-as3";

class Car {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
}

const myClass = new ByteArray();

myClass.writeByte(100);
myClass.writeObject(new Car("Name", "Type"));

console.log(myClass.readByte());
console.log(myClass.readUTF());
console.log(myClass.readShort());
console.log(myClass.readObject());
```
