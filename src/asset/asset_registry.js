pc.extend(pc.asset, function () {
    /**
    * @name pc.asset.AssetRegistry
    * @class Container for all assets that are available to this application
    * @constructor Create an instance of an AssetRegistry.
    * Note: PlayCanvas scripts are provided with an AssetRegistry instance as 'context.assets'.
    * @param {pc.resources.ResourceLoader} loader The ResourceLoader used to to load the asset files.
    * @param {String} prefix The prefix added to file urls before the loader tries to fetch them
    */
    var AssetRegistry = function (loader, prefix) {
        if (!loader) {
            throw new Error("Must provide a ResourceLoader instance for AssetRegistry");
        }

        this.loader = loader;
        this._prefix = prefix || "";

        this._cache = {}; // main asset cache, keyed by resourceId
        this._names = {}; // index for looking up assets by name
        this._urls = {}; // index for looking up assets by url
    };

    AssetRegistry.prototype = {
        update: function (toc) {
            for (var resourceId in toc.assets) {
                var asset = this.getAssetByResourceId(resourceId);

                if (!asset) {
                    // Create assets for every entry in TOC and add to AssetCache
                    var assetData = toc.assets[resourceId];
                    asset = new pc.asset.Asset(assetData.name, assetData.type, assetData.file, assetData.data, this._prefix);
                    asset.resourceId = resourceId; // override default resourceId
                    this.addAsset(asset);

                    // Register hashes with the resource loader
                    if (asset.file) {
                        this.loader.registerHash(asset.file.hash, asset.getFileUrl());
                    }
                } else {
                    // Update asset data
                    pc.extend(asset, toc.assets[resourceId]);
                }

            }
        },

        /**
        * @function
        * @name pc.asset.AssetRegistry#all
        * @description Return a list of all assets in the registry
        * @returns [pc.asset.Asset] List of all assets in the registry
        */
        all: function () {
            return Object.keys(this._cache).map(function (resourceId) {
                return this.getAssetByResourceId(resourceId);
            }, this);
        },

        /**
        * @function
        * @name pc.asset.AssetRegistry#addAsset
        * @description Add a new
        * @param {pc.asset.Asset} asset The asset to add to the registry
        */
        addAsset: function (asset) {
            this._cache[asset.resourceId] = asset;
            if (!this._names[asset.name]) {
                this._names[asset.name] = [];
            }
            this._names[asset.name].push(asset.resourceId);
            if (asset.file) {
                this._urls[asset.file.url] = asset.resourceId;
            }

        },

        /**
        * @private
        * @function
        * @name pc.asset.AssetRegistry#findAll
        * @description Return all Assets with the specified name and type found in the registry
        * @param {String} name The name of the Assets to find
        * @param {String} [type] The type of the Assets to find
        * @returns {[pc.asset.Asset]} A list of all Assets found
        * @example
        * var assets = context.assets.findAll("myTextureAsset", pc.asset.ASSET_TEXTURE);
        * console.log("Found " + assets.length + " assets called " + name);
        */
        findAll: function (name, type) {
            var self = this;
            var ids = this._names[name];
            var assets;
            if (ids) {
                assets = ids.map(function (id) {
                    return self._cache[id];
                });

                if (type) {
                    return assets.filter(function (asset) {
                        return (asset.type === type);
                    });
                } else {
                    return assets;
                }
            } else {
                return [];
            }
        },

        /**
        * @private
        * @function
        * @name pc.asset.AssetRegistry#find
        * @description Return the first Asset with the specified name and type found in the registry
        * @param {String} name The name of the Asset to find
        * @param {String} [type] The type of the Asset to find
        * @returns {pc.asset.Asset} A single Asset or null if no Asset is found
        * @example
        * var asset = context.assets.find("myTextureAsset", pc.asset.ASSET_TEXTURE);
        */
        find: function (name, type) {
            var asset = this.findAll(name, type);
            return asset ? asset[0] : null;
        },

        /**
        * @function
        * @name pc.asset.AssetRegistry#getAssetByResourceId
        * @description Return the {@link pc.asset.Asset} object in the AssetRegistry with the resourceId provided
        * @param {String} resourceId The resourceId of the Asset to return
        * @returns {pc.asset.Asset} The Asset or null if no Asset is found.
        */
        getAssetByResourceId: function (resourceId) {
            return this._cache[resourceId];
        },

        getAssetByUrl: function (url) {
            var resourceId = this._urls[url];
            return this._cache[resourceId];
        },

        /**
        * @private
        */
        getAssetByName: function (name) {
            console.warn("WARNING: getAssetByName: Function is deprecated. Use find() or findAll() instead.");
            return this.find(name);
        },

        /**
        * @function
        * @name pc.asset.AssetRegistry#load
        * @description Load the resources for a set of assets and return a promise the resources that they load.
        * If the asset type doesn't have file (e.g. Material Asset) then a resource is not returned (the resource list is shorter)
        * NOTE: Usually you won't have to call load() directly as Assets will be loaded as part of the Pack loading process. This is only
        * required if you are loading assets manually without using the PlayCanvas tools.
        * @param {[pc.fw.Asset]} assets The list of assets to load
        * @param {[Object]} [results] List of results for the resources to be stored in. This is usually not required
        * @param {Object} [options] Options to pass on to the loader
        * @returns {Promise} A Promise to the resources
        * @example
        * var asset = new pc.asset.Asset("My Texture", "texture", {
        *   url: "/example/mytexture.jpg"
        * });
        */
        load: function (assets, results, options) {
            if (!assets.length) {
                assets = [assets];
            }

            if (typeof(options) === 'undefined') {
                // shift arguments
                options = results;
                results = [];
            }

            var requests = [];
            assets.forEach(function (asset, index) {
                var existing = this.getAssetByResourceId(asset.resourceId);
                if (!existing) {
                    // If the asset isn't in the registry then add it.
                    this.addAsset(asset);
                }

                switch(asset.type) {
                    case pc.asset.ASSET_MODEL:
                        requests.push(this._createModelRequest(asset));
                        break;
                    case pc.asset.ASSET_TEXTURE:
                        requests.push(this._createTextureRequest(asset, results[index]));
                        break;
                    default: {
                        requests.push(this._createAssetRequest(asset));
                        break;
                    }
                }

            }, this);

            // request all assets
            // return this.loader.request(requests.filter(function (r) { return r !== null; }), options).then(null, function (error) {
            //     // Ensure exceptions while loading are thrown and not swallowed by promises
            //     setTimeout(function () {
            //         throw error;
            //     }, 0)
            // });

            // request all assets, then attach loaded resources onto asset
            return this.loader.request(requests.filter(function (r) { return r !== null; }), options).then(function (resources) {

                var promise = new RSVP.Promise(function (resolve, reject) {
                    var index = 0;
                    requests.forEach(function (r, i) {
                        if (r) {
                            assets[i].resource = resources[index++];
                        } else {
                            assets[i].resource = null;
                        }
                    });
                    resolve(resources);
                });
                return promise;
            }, function (error) {
                // Ensure exceptions while loading are thrown and not swallowed by promises
                setTimeout(function () {
                    throw error;
                }, 0)
            });
        },

        _createAssetRequest: function (asset, result) {
            var url = asset.getFileUrl();
            if (url) {
                return this.loader.createFileRequest(url, asset.type);
            } else {
                return null;
            }

        },

        _createModelRequest: function (asset) {
            var url = asset.getFileUrl();
            var mapping = (asset.data && asset.data.mapping) ? asset.data.mapping: [];

            return new pc.resources.ModelRequest(url, mapping);
        },

        _createTextureRequest: function (asset, texture) {
            return new pc.resources.TextureRequest(asset.getFileUrl(), null, texture);
        }
    };

    return {
        AssetRegistry: AssetRegistry
    };
}())
