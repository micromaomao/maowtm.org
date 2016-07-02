const express = require('express');
const pages = require('../pages');
const lwip = require('lwip');
const qs = require('querystring');

module.exports = function (db, lock) {
    var mongoose = db;
    mongoose.Schema = require('mongoose').Schema;
    var imageSchema = new mongoose.Schema({
        name: 'String',
        src: 'Buffer',
        width: 'Number'
    });
    var cachedScaleSchema = new mongoose.Schema({
        imgId: 'ObjectId',
        scale: 'Number',
        data: 'Buffer'
    });
    var lock;

    // These stuff "cache" images ( and their different sizes, when needed ) to database.

    imageSchema.static('addImageIfNotExist', function () {
        throw new Error("addImageIfNotExist is deprecated. Use addImage with a buffer instead.");
    });
    
    // See https://www.npmjs.com/package/lwip#supported-formats
    const validExtensions = [
        "png",
        "jpg",
        "gif"
    ];

    /**
     * Add or replace image with name `imgName` with `buffer`.
     * @param imgName string an unique name of the image. Extension must be included.
     * @param imageData Buffer raw data of the image.
     * @param callback function(err)
     */
    imageSchema.static('addImage', function (imgName, imageData, callback) {
        if (typeof callback != "function") {
            throw new Error("Illegal / no callback.");
        }
        if (typeof imgName != "string" || imgName.length <= 0
           || !Buffer.isBuffer(imageData) || imageData.length <= 0) {
            return callback(new Error("Illegal argument."));
        }
        var ext = imgName.match(/\.([a-zA-Z0-9]+)$/);
        if (!ext) {
            return callback(new Error("Extension not provided."));
        }
        ext = ext[1];
        if (validExtensions.indexOf(ext) < 0) {
            return callback(new Error(ext.toUpperCase() + ": Format not supported."));
        }
        lwip.open(imageData, ext, function (err, lwipImg) {
            if (err) {
                callback(err);
                return;
            }
            image.findOne({ name: imgName }, function (err, existImgDoc) {
                if (err) {
                    callback(err);
                    return;
                }
                if (existImgDoc) {
                    new image(existImgDoc).purge(function (err) {
                        if (err) {
                            callback(err);
                            return;
                        }
                        doAdd();
                    });
                } else {
                    doAdd();
                }
            });
            function doAdd() {
                var imgDoc = new image({ name: imgName, src: imageData, width: lwipImg.width() });
                imgDoc.save(err => callback(err));
            }
        });
    });
    /**
     * Read a image cache from database. The nearest 50px scale will be returned. If there isn't already
     * a cached scaled image for the caller to use, one will be created. If the width provided is larger
     * than the width of the original image, the original will be returned.
     * @param scale integer width in px.
     * @param callback function(err, buffer) the function to give data to.
     */
    imageSchema.method('queryScale', function (scale, callback) {
        if (typeof callback != "function") {
            throw new Error("Illegal callback.");
        }
        if (!Number.isFinite(scale) && scale > 0) {
            callback(null, this.src);
            return;
        }
        if (!Number.isInteger(scale) || scale <= 0)
            return callback(new Error("Illegal argument."));
        scale = Math.ceil(scale / 50) * 50;
        if (scale >= this.width) {
            callback(null, this.src);
            return;
        }
        var th = this;
        // Lock the image to prevent double-caching.
        lock('imageCaching\t' + th._id.toString(), function(done) {
            cachedScale.findOne({ imgId: th._id, scale: scale }, function (err, cachedDoc) {
                if(err) {
                    callback(err, null);
                    done();
                } else {
                    if(cachedDoc) {
                        callback(null, cachedDoc.data);
                        done();
                    } else {
                        createImageScale();
                    }
                }
            });
            function createImageScale() {
                cachedDoc = new cachedScale({
                    imgId: th._id,
                    scale: scale
                });
                lwip.open(th.src, 'png', function (err, img) {
                    if(err) {
                        callback(err, null);
                        done();
                    } else {
                        var scalefactor = scale / th.width;
                        img.scale(scalefactor, function (err, newImage) {
                            if(err) {
                                callback(err, null);
                                done();
                            } else {
                                newImage.toBuffer('png', function (err, buff) {
                                    if(err) {
                                        callback(err, null);
                                        done();
                                    } else {
                                        cachedDoc.set('data', buff);
                                        cachedDoc.save(function(err) {
                                            callback(null, buff);
                                            done();
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });
    /*
     * Remove the image and all it's cache from database.
     */
    imageSchema.method('purge', function(callback) {
        if (typeof callback != "function") {
            throw new Error("Illegal callback.");
        }
        var _id = this._id;
        lock('imageCaching\t' + _id.toString(), function(done) {
            cachedScale.remove({imgId: _id}, function(err) {
                if (err) {
                    callback(err);
                    done();
                    return;
                }
                image.remove({_id: _id}, function(err) {
                    callback(err);
                    done();
                });
            });
        });
    });

    var image = mongoose.model('image', imageSchema);
    var cachedScale = mongoose.model('cachedScale', cachedScaleSchema);

    var r_static = express.Router();
    r_static.use(express.static('static'));
    var r_img = express.Router({
        strict: true
    });
    r_img.get('/:imgname', function (req, res, next) {
        var desiredWidth = parseInt(req.query.width);
        if (!req.query.width || Number.isNaN(desiredWidth) || desiredWidth <= 0) {
            desiredWidth = Infinity;
        }
        image.findOne({ name: req.params.imgname }, function (err, img) {
            if(err)
                next(err);
            else if (!img) {
                next();
            } else {
                if (req.query.width) {
                    if (desiredWidth >= img.width) {
                        delete req.query.width;
                        var qr = qs.stringify(req.query);
                        if(qr.length > 0) {
                            qr = "?" + qr;
                        }
                        res.redirect(302, req.path + qr);
                        return;
                    } else if (req.query.width.toString() != desiredWidth.toString()) {
                        req.query.width = desiredWidth;
                        var qr = qs.stringify(req.query);
                        if(qr.length > 0) {
                            qr = "?" + qr;
                        }
                        res.redirect(302, req.path + qr);
                        return;
                    }
                }
                img.queryScale(desiredWidth, function (err, buff) {
                    if(err)
                        next(err);
                    else {
                        res.type('png');
                        res.send(buff);
                    }
                });
            }
        });
    });
    r_img.get('/', function(req, res) {
        res.redirect(302, "https://maowtm.org/img/")
    });
    return function(req, res, next) {
        if (req.hostname == 'static.maowtm.org') {
            r_static(req, res, next);
        } else if (req.hostname == 'img.maowtm.org') {
            r_img(req, res, next);
        } else {
            next();
        }
    };
};
