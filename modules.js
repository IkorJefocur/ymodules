(function(global) {

const
	DECL_STATES = {
		NOT_RESOLVED : 'NOT_RESOLVED',
		IN_RESOLVING : 'IN_RESOLVING',
		RESOLVED     : 'RESOLVED'
	},
	NOT_DEFINED_STATE = 'NOT_DEFINED';

/**
 * Creates a new instance of modular system
 * @returns {Object}
 */
function create() {
	const
		curOptions = {
			trackCircularDependencies : true,
			allowMultipleDeclarations : true,
			allowDependenciesOverride : true
		},
		modulesStorage = {};
	let
		waitForNextTick = false,
		pendingRequires = [];

	/**
	 * Defines module
	 * @param {String} name
	 * @param {String[]} [deps]
	 * @param {Function} declFn
	 */
	function define(name, deps, declFn) {
		if (!declFn) {
			declFn = deps;
			deps = [];
		}

		if (!modulesStorage[name])
			modulesStorage[name] = {
				name : name,
				decl : []
			};
		const module = modulesStorage[name];

		module.decl[0] = {
			name       : name,
			prev       : module.decl[0],
			fn         : declFn,
			state      : DECL_STATES.NOT_RESOLVED,
			deps       : deps.map(normalizeDependency),
			dependents : [],
			exports    : undefined
		};
	}

	/**
	 * Requires modules
	 * @param {String|String[]} modules
	 * @param {Function} cb
	 * @param {Function} [errorCb]
	 */
	function require(modules, cb, errorCb) {
		if (typeof modules === 'string')
			modules = [modules];

		if (!waitForNextTick) {
			waitForNextTick = true;
			nextTick(onNextTick);
		}

		pendingRequires.push({
			deps : modules.map(normalizeDependency),
			cb   : function(exports, prev, error) {
				error
					? (errorCb || onError)(error)
					: cb.call(global, exports, prev);
			}
		});
	}

	/**
	 * Returns state of module
	 * @param {String} name
	 * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
	 */
	function getState(name) {
		const module = modulesStorage[name];
		return module
			? DECL_STATES[module.decl[0].state]
			: NOT_DEFINED_STATE;
	}

	/**
	 * Returns whether the module is defined
	 * @param {String} name
	 * @returns {Boolean}
	 */
	function isDefined(name) {
		return !!modulesStorage[name];
	}

	/**
	 * Sets options
	 * @param {Object} options
	 */
	function setOptions(options) {
		Object.assign(curOptions, options);
	}

	function getStat() {
		const res = {};

		for (let [name, module] of Object.entries(modulesStorage)) {
			const state = module.decl[0].state;
			if (!res[state])
				res[state] = [];
			res[state].push(name);
		}

		return res;
	}

	function onNextTick() {
		waitForNextTick = false;
		applyRequires();
	}

	function applyRequires() {
		const requiresToProcess = pendingRequires;
		pendingRequires = [];

		for (let require of requiresToProcess)
			requireDeps(null, require.deps, [], require.cb);
	}

	function requireDeps(fromDecl, deps, path, cb) {
		let unresolvedDepsCnt = deps.length;
		const prev = fromDecl ? fromDecl.prev : undefined;
		if (prev)
			unresolvedDepsCnt++;
		if (!unresolvedDepsCnt)
			cb({});

		const decls = {};
		function onDeclResolved(_, error) {
			if (error) {
				cb(null, null, error);
				return;
			}

			if (!--unresolvedDepsCnt) {
				for (let [alias, decl] of Object.entries(decls))
					Object.defineProperty(decls, alias, {
						get() {
							if (decl.state === DECL_STATES.IN_RESOLVING)
								throw buildCircularDependenceError(decl, path);
							return decl.exports;
						},
						configurable: true,
						enumerable: true
					});
				const args = [decls, prev && prev.exports];
				if (deps.length === 0)
					args.shift();
				cb(...args);
			}
		}

		for (let dep of deps) {
			let decl;
			const [name, alias, overrides] = dep;

			if (!modulesStorage[name]) {
				cb(null, null, buildModuleNotFoundError(name, fromDecl));
				return;
			}

			const variants = modulesStorage[name].decl;
			const base = variants[0];

			if (overrides) {
				if (!curOptions.allowDependenciesOverride) {
					cb(null, null, buildDependenciesOverrideError(name, fromDecl));
					return;
				}

				decl = variants.find(variant => variant.deps.every(([dep], index) =>
					overrides[base.deps[index]]
						? dep === overrides[base.deps[index]]
						: dep === base.deps[index]
				));

				if (!decl) {
					decl = Object.assign({}, base, {
						deps: base.deps.map(dep =>
							dep[0] in overrides
								? [overrides[dep[0]], dep[0], undefined]
								: dep
						),
						dependents: [],
						state: DECL_STATES.NOT_RESOLVED
					});
					variants.push(decl);
				}
			}

			else
				decl = base;

			decls[alias] = decl;
			startDeclResolving(decl, path, onDeclResolved);
		}

		if (prev)
			startDeclResolving(prev, path, onDeclResolved);
	}

	function startDeclResolving(decl, path, cb) {
		if (decl.state === DECL_STATES.RESOLVED) {
			cb(decl.exports);
			return;
		} else if (decl.state === DECL_STATES.IN_RESOLVING) {
			curOptions.trackCircularDependencies && isDependenceCircular(decl, path)
				? cb()
				: decl.dependents.push(cb);
			return;
		}

		decl.dependents.push(cb);

		if (decl.prev && !curOptions.allowMultipleDeclarations) {
			provideError(decl, buildMultipleDeclarationError(decl));
			return;
		}

		curOptions.trackCircularDependencies && (path = path.concat([decl]));

		let isProvided = false;

		decl.state = DECL_STATES.IN_RESOLVING;
		requireDeps(
			decl,
			decl.deps,
			path,
			function(depDeclsExports, prev, error) {
				if (error) {
					provideError(decl, error);
					return;
				}

				function provide(exports, error) {
					if (isProvided) {
						cb(null, buildDeclAreadyProvidedError(decl));
						return;
					}

					isProvided = true;
					error
						? provideError(decl, error)
						: provideDecl(decl, exports);
				}

				const {name, deps} = decl;
				decl.fn.call({global, name, deps}, provide, depDeclsExports, prev);
			});
	}

	function provideDecl(decl, exports) {
		decl.exports = exports;
		decl.state = DECL_STATES.RESOLVED;

		for (let dependent of decl.dependents)
			dependent(exports);

		decl.dependents = undefined;
	}

	function provideError(decl, error) {
		decl.state = DECL_STATES.NOT_RESOLVED;

		for (let dependent of decl.dependents)
			dependent(null, error);

		decl.dependents = [];
	}

	return {create, define, require, getState, isDefined, setOptions, getStat};
}

function onError(e) {
	nextTick(function() {
		throw e;
	});
}

function buildModuleNotFoundError(name, decl) {
	return new Error(
		decl
			? `Module "${decl.name}": can\'t resolve dependence "${name}"`
			: `Required module "${name}" can\'t be resolved`
	);
}

function buildCircularDependenceError(decl, path) {
	const strPath = path.map(pathDecl => pathDecl.name);
	strPath.push(decl.name);

	return new Error(`Circular dependence has been detected: "${strPath.join(' -> ')}"`);
}

function buildDeclAreadyProvidedError(decl) {
	return new Error(`Declaration of module "${decl.name}" has already been provided`);
}

function buildMultipleDeclarationError(decl) {
	return new Error(`Multiple declarations of module "${decl.name}" have been detected`);
}

function buildDependenciesOverrideError(name, decl) {
	return new Error(
		decl
			? `Dependency override of module "${name}" for module "${decl.name}" have been detected`
			: `Dependency override of module "${name}" have been detected`
	);
}

function isDependenceCircular(decl, path) {
	return path.includes(decl);
}

function normalizeDependency(dep) {
	if (typeof dep === 'string')
		dep = [dep];
	let [name, alias, overrides] = dep;
	if (!overrides && typeof alias === 'object') {
		overrides = alias;
		alias = name;
	}
	if (!alias)
		alias = name;
	return [name, alias, overrides];
}

const nextTick = (function() {
	var fns = [],
		enqueueFn = function(fn) {
			return fns.push(fn) === 1;
		},
		callFns = function() {
			var fnsToCall = fns, i = 0, len = fns.length;
			fns = [];
			while(i < len) {
				fnsToCall[i++]();
			}
		};

	if(typeof process === 'object' && process.nextTick) { // nodejs
		return function(fn) {
			enqueueFn(fn) && process.nextTick(callFns);
		};
	}

	if(global.setImmediate) { // ie10
		return function(fn) {
			enqueueFn(fn) && global.setImmediate(callFns);
		};
	}

	if(global.postMessage && !global.opera) { // modern browsers
		var isPostMessageAsync = true;
		if(global.attachEvent) {
			var checkAsync = function() {
					isPostMessageAsync = false;
				};
			global.attachEvent('onmessage', checkAsync);
			global.postMessage('__checkAsync', '*');
			global.detachEvent('onmessage', checkAsync);
		}

		if(isPostMessageAsync) {
			var msg = '__modules' + (+new Date()),
				onMessage = function(e) {
					if(e.data === msg) {
						e.stopPropagation && e.stopPropagation();
						callFns();
					}
				};

			global.addEventListener?
				global.addEventListener('message', onMessage, true) :
				global.attachEvent('onmessage', onMessage);

			return function(fn) {
				enqueueFn(fn) && global.postMessage(msg, '*');
			};
		}
	}

	var doc = global.document;
	if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
		var head = doc.getElementsByTagName('head')[0],
			createScript = function() {
				var script = doc.createElement('script');
				script.onreadystatechange = function() {
					script.parentNode.removeChild(script);
					script = script.onreadystatechange = null;
					callFns();
				};
				head.appendChild(script);
			};

		return function(fn) {
			enqueueFn(fn) && createScript();
		};
	}

	return function(fn) { // old browsers
		enqueueFn(fn) && setTimeout(callFns, 0);
	};
})();

if (typeof exports === 'object')
	module.exports = create();
else
	global.modules = create();

})(typeof window !== 'undefined' ? window : global);