#!/usr/bin/env bash

vendor () {
  cp "./node_modules/$1" "./vendor/${1##*/}"
}

npm install
mkdir ./vendor
vendor whatwg-fetch/fetch.js
