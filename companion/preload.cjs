'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('toastApi', {
  layout: () => ipcRenderer.send('toast:layout')
})
