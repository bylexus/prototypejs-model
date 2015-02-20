/**
 * PrototypeJS Model extension - Enables Prototype JS users to fetch / store
 * Models from / to a backend using AJAX / REST
 *
 * Inspired by (but not copied) Backbone's Backbone.Model and Backbone.sync
 * @see http://backbonejs.org/
 *
 * Usage example:
 * --------------
 * <code>
 * // Create your own Model class:
 * var Person = Class.create(Prototype.Model,{
 *     urlRoot: '/entity/Person'
 * });
 *
 * // Use an instance of the model:
 * var alex = new Person({
 *     name: 'Schenkel',
 *     firstname: 'Alex'
 * });
 * alex.save({onSuccess: function(res,model){
 *     console.log(model.getId());
 * }});
 * </code>
 *
 * @author Alexander Schenkel <alex@alexi.ch>
 * @copyright 2015 Alexander Schenkel
 * @license Released under the MIT License
 */
(function(P) {
    if (P) {
        P.Model = Class.create({
            idAttribute: 'id',

            /**
             * The URL root for this Model. Must be set in child classes,
             * e.g. to '/entities/Person'.
             * Used by the url() function to build the persistence URL.
             */
            urlRoot: null,

            /**
             * Constructor. Sets the given data (key/value pairs)
             * as attributes on new model instances.
             */
            initialize: function(data) {
                data = data || {};
                this._attributes = {};
                this._listeners = {};

                /** TODO: Implement dirty attribute detection */
                this._dirtyAttributes = {};

                this.set(data);
            },

            /**
             * Returns the instance's ID of the model. Null means it is a new, not saved
             * instance.
             *
             * @return mixed The ID (int, string), if any
             */
            getId: function() {
                return this[this.idAttribute] || null;
            },

            /**
             * Sets the Model instance's ID. It also sets it as attribute
             * value so that it is sent to the server when synced.
             *
             * @param mixed id The id to set (e.g. an integer, or even a string)
             * @return this Supports fluent interface by returning itself
             */
            setId: function(id) {
                this[this.idAttribute] = id || null;
                this._attributes[this.idAttribute] = id || null;
                return this;
            },

            /**
             * Sets Model attributes (key/values). Takes either a key and a value,
             * or a plain object containing key/value pairs.
             *
             * @param string/Object keyOrObject A string representing the key (e.g. 'name')
             *    or an object with key/values (e.g. {'name':'alex','age':'too old'})
             * @param mixed value The value to set if keyOrObject is a string. Ignored when keyOrObject is an object.
             * @return this Supports fluent interface by returning itself
             */
            set: function(keyOrObject, value) {
                var ret,
                    oldValues = {},
                    newValues = {};
                if (keyOrObject instanceof Object) {
                    $H(keyOrObject).each(function(item) {
                        ret = this.set(item.key, item.value);
                    }, this);
                } else {
                    ret = this.setAttribute(keyOrObject, value,newValues,oldValues);
                    this.fireEvent('updated',this,newValues,oldValues);
                }
                return ret;
            },

            /**
             * Sets a single Model attribute (e.g. 'name' to 'Alex'). Internal helper function.
             * Please use set() instead.
             *
             * @param string key The key of the attribute to set, e.g. 'name'
             * @param mixed value The value to set
             * @return this Supports fluent interface by returning itself
             */
            setAttribute: function(key, value,newVals, oldVals) {
                if (typeof key === 'string') {
                    if (this._attributes[key] !== value) {
                        oldVals[key] = this._dirtyAttributes[key];
                        newVals[key] = value;
                        this._dirtyAttributes[key] = value;
                    }

                    this._attributes[key] = value;
                    if (key === this.idAttribute) {
                        this.setId(value);
                    }
                }
                return this;
            },

            /**
             * Returns a specific attribute, or all if key is omitted
             *
             * @param string key The name of the attribute to get. If omitted, an object
             *    containing all attributes (key/value) is returned.
             * @return mixed The value of the requested attribute, or an object with all attributes
             */
            get: function(key) {
                if (!key) {
                    return Object.clone(this._attributes);
                }
                if (this.hasAttribute(key)) {
                    return this._attributes[key];
                } else {
                    return null;
                }
            },

            /**
             * Creates the REST url for the actual state of the Model. Override this
             * method if you want to implement your own URL scheme. Here is how it works
             * by default:
             *
             * - non-persistent state (id = null): return '<urlRoot>'
             * - persistent state (id <> null): return '<urlRoot>/<id>'
             */
            url: function() {
                var url = this.urlRoot;
                if (!url) throw new Error("urlRoot not set. Please define an urlRoot in your model.");

                if (!!this.getId()) {
                    url += '/' + String(this.getId());
                }
                return url;
            },

            /**
             * Makes this model persistent by sending the data to a REST interface (by default).
             * Make sure to set the urlRool property on class definition.
             *
             * options are all options that Prototype's Ajax.Request understands, so you
             * can e.g. deliver a onSuccess callback:
             *
             * <code>
             * myModel.save({onSuccess: function(response,model){
             *     // do something after save here
             * }});
             * </code>
             */
            save: function(options) {
                var url = this.url(),
                    method = !!this.getId()?'update':'create';

                return this._request(url, method, options);
            },

            /**
             * Fetches this Model's representation from the server. Only
             * allowed for existing (id <> null) models. options is passed
             * along to Prototype's Ajax.Request function.
             */
            fetch: function(options) {
                if (!this.getId()) throw new Error('Cannot be called for new Models');

                var url = this.url(),
                    method = 'read';

                return this._request(url, method, options);
            },

            /**
             * invokes a delete request to the server.  Only
             * allowed for existing (id <> null) models. options is passed
             * along to Prototype's Ajax.Request function.
             *
             * After the deletion was successful, the model instance is updated with the
             * server data, even if the server removed the instance.
             */
            destroy: function(options) {
                if (!this.getId()) throw new Error('Cannot be called for new Models');

                var url = this.url(),
                    method = 'delete';

                return this._request(url, method, options);
            },

            /**
             * internal helper function for initiating the requests for save, fetch, destroy
             */
            _request: function (url,method,options) {
                var syncOptions = {};

                options = options || {};
                Object.extend(syncOptions, {
                    onSuccess: (function(callback) {
                        return function(response) {
                            this.parse(response);
                            if (callback instanceof Function) {
                                callback(response,this);
                            }
                        }.bind(this);
                    }.bind(this)(options.onSuccess))
                });

                return this.sync(url, method, this, syncOptions);
            },

            /**
             * Just calls Prototype.Model.sync. If you want your own, Model-specific implementation,
             * override this function.
             * @see Prototype.model.sync. Also here: inspired by http://backbonejs.org/#Sync
             */
            sync: function() {
                return P.Model.sync.apply(P.Model,arguments);
            },

            /**
             * Called by save() and fetch() with the server's data response. Fills in the
             * server response to the model. In the default implementation, it just
             * takes the plain JSON object from the server (if any) and store the values on the model.
             */
            parse: function(response) {
                if (response && response.responseJSON) {
                    this.set(response.responseJSON);
                }
            },

            /**
             * Checks if the model has a certain attribute.
             *
             * @return boolean
             */
            hasAttribute: function(key) {
                return Object.keys(this._attributes).indexOf(key) >= 0;
            },

            on: function(eventName, callback) {
                if (!this._listeners[eventName]) {
                    this._listeners[eventName] = [];
                }
                this._listeners[eventName].push(callback);
                return this;
            },

            off: function(eventName, callback) {
                var handlerArr,index;

                if (!callback) {
                    // remove all handlers for an event:
                    console.log('removing event handerl for '+eventName);
                    delete this._listeners[eventName];
                } else {
                    // only remove specific hander:
                    handlerArr = this._listeners[eventName];
                    if (handlerArr && handlerArr.indexOf(callback) > -1) {
                        handlerArr.splice(handlerArr.indexOf(callback),1);
                    }
                }
                return this;
            },

            fireEvent: function(eventName) {
                var args = $A(arguments).splice(1),
                    allTrue = true;
                $A(this._listeners[eventName]).each(function(listener) {
                    if (listener instanceof Function) {
                        allTrue = allTrue && listener.apply(null,args) !== false;
                    }
                }.bind(this));
                return allTrue;
            }
        });
    }
}(Prototype));
