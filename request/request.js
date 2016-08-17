"use strict"

var buildQueryString = require("../querystring/build")
var StreamFactory = require("../util/stream")

module.exports = function($window, log) {
	var Stream = StreamFactory(log)
	var callbackCount = 0

	var oncompletion
	function setCompletionCallback(callback) {oncompletion = callback}
	
	function request(args) {
		var stream = Stream()
		if (args.initialValue !== undefined) stream(args.initialValue)
		
		var useBody = typeof args.useBody === "boolean" ? args.useBody : args.method !== "GET" && args.method !== "TRACE"
		
		if (typeof args.serialize !== "function") args.serialize = typeof FormData !== "undefined" && args.data instanceof FormData ? function(value) {return value} : JSON.stringify
		if (typeof args.deserialize !== "function") args.deserialize = deserialize
		if (typeof args.extract !== "function") args.extract = extract
		
		args.url = interpolate(args.url, args.data)
		if (useBody) args.data = args.serialize(args.data)
		else args.url = assemble(args.url, args.data)
		
		var xhr = new $window.XMLHttpRequest()
		xhr.open(args.method, args.url, typeof args.async === "boolean" ? args.async : true, typeof args.user === "string" ? args.user : undefined, typeof args.password === "string" ? args.password : undefined)
		
		if (args.serialize === JSON.stringify && useBody) {
			xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8")
		}
		if (args.deserialize === deserialize) {
			xhr.setRequestHeader("Accept", "application/json, text/*")
		}
		
		if (typeof args.config === "function") xhr = args.config(xhr, args) || xhr
		
		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4) {
				try {
					var response = (args.extract !== extract) ? args.extract(xhr, args) : args.deserialize(args.extract(xhr, args))
					if (xhr.status >= 200 && xhr.status < 300) {
						stream(cast(args.type, response))
					}
					else {
						var error = new Error(xhr.responseText)
						for (var key in response) error[key] = response[key]
						stream.error(error)
					}
				}
				catch (e) {
					stream.error(e)
				}
				if (typeof oncompletion === "function") oncompletion()
			}
		}
		
		if (useBody) xhr.send(args.data)
		else xhr.send()
		
		return stream
	}

	function jsonp(args) {
		var stream = Stream()
		if (args.initialValue !== undefined) stream(args.initialValue)
		
		var callbackName = args.callbackName || "_mithril_" + Math.round(Math.random() * 1e16) + "_" + callbackCount++
		var script = $window.document.createElement("script")
		$window[callbackName] = function(data) {
			script.parentNode.removeChild(script)
			stream(cast(args.type, data))
			if (typeof oncompletion === "function") oncompletion()
			delete $window[callbackName]
		}
		script.onerror = function() {
			script.parentNode.removeChild(script)
			stream.error(new Error("JSONP request failed"))
			if (typeof oncompletion === "function") oncompletion()
			delete $window[callbackName]
		}
		if (args.data == null) args.data = {}
		args.url = interpolate(args.url, args.data)
		args.data[args.callbackKey || "callback"] = callbackName
		script.src = assemble(args.url, args.data)
		$window.document.documentElement.appendChild(script)
		return stream
	}

	function interpolate(url, data) {
		if (data == null) return url

		var tokens = url.match(/:[^\/]+/gi) || []
		for (var i = 0; i < tokens.length; i++) {
			var key = tokens[i].slice(1)
			if (data[key] != null) {
				url = url.replace(tokens[i], data[key])
				delete data[key]
			}
		}
		return url
	}

	function assemble(url, data) {
		var querystring = buildQueryString(data)
		if (querystring !== "") {
			var prefix = url.indexOf("?") < 0 ? "?" : "&"
			url += prefix + querystring
		}
		return url
	}

	function deserialize(data) {
		try {return data !== "" ? JSON.parse(data) : null}
		catch (e) {throw new Error(data)}
	}

	function extract(xhr) {return xhr.responseText}
	
	function cast(type, data) {
		if (typeof type === "function") {
			if (data instanceof Array) {
				for (var i = 0; i < data.length; i++) {
					data[i] = new type(data[i])
				}
			}
			else return new type(data)
		}
		return data
	}
	
	return {request: request, jsonp: jsonp, setCompletionCallback: setCompletionCallback}
}
