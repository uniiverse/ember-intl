/* jshint node: true */

/**
 * Copyright 2015, Yahoo! Inc.
 * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */

'use strict';

var serialize    = require('serialize-javascript');
var mergeTrees   = require('broccoli-merge-trees');
var Funnel       = require('broccoli-funnel');
var walkSync     = require('walk-sync');
var path         = require('path');
var fs           = require('fs');

var LocaleWriter = require('./lib/broccoli-cldr');

var relativeFormatPath = path.dirname(require.resolve('intl-relativeformat'));
var messageFormatPath  = path.dirname(require.resolve('intl-messageformat'));
var intlPath           = path.dirname(require.resolve('intl'));
var utils = require('./lib/utils');

module.exports = {
    name: 'ember-intl',

    included: function (app) {
        this.app = app;
        var vendorPath = this.treePaths.vendor;
        app.import(vendorPath + '/messageformat/intl-messageformat.js');
        app.import(vendorPath + '/relativeformat/intl-relativeformat.js');
    },

    treeForApp: function (inputTree) {
        var appPath = this.treePaths.app;
        var localesPath = path.join(this.project.root, appPath, 'locales');
        var trees = [inputTree];

        if (fs.existsSync(localesPath)) {
            var locales = walkSync(localesPath).map(function (filename) {
                return path.basename(filename, path.extname(filename));
            }).filter(LocaleWriter.has);

            var localeTree = new LocaleWriter(inputTree, 'cldrs', {
                locales:        locales,
                pluralRules:    true,
                relativeFields: true,
                prelude:        '/*jslint eqeq: true*/\n',
                wrapEntry:      this._transformLocale
            });

            trees.push(localeTree)
        }

        return mergeTrees(trees, { overwrite: true });
    },

    treeForVendor: function (inputTree) {
        var trees = [];

        if (inputTree) {
            trees.push(inputTree);
        }

        trees.push(new Funnel(this.treeGenerator(messageFormatPath), {
            srcDir:  '/dist',
            destDir: 'messageformat'
        }));

        trees.push(new Funnel(this.treeGenerator(relativeFormatPath), {
            srcDir:  '/dist',
            destDir: 'relativeformat'
        }));

        return mergeTrees(trees);
    },

    treeForPublic: function (inputTree) {
        var config = this.project.config(this.app.env);
        var projectLocales = this.findLocales();
        var trees  = [inputTree];

        trees.push(new Funnel(intlPath, {
            srcDir:  '/',
            files:   ['Intl.complete.js', 'Intl.js', 'Intl.min.js'],
            destDir: '/assets/intl/polyfill/'
        }));

        var localeFunnel = {
          srcDir: 'locale-data/jsonp',
          destDir: '/assets/intl/polyfill/locales/'
        };

        if (projectLocales.length) {
          localeFunnel.include = projectLocales.map(function(locale) {
            return new RegExp('^' + locale + '.js$', 'i');
          });
        }

        trees.push(new Funnel(intlPath, localeFunnel));

        return mergeTrees(trees, { overwrite: true });
    },

    _transformLocale: function (result) {
        return 'export default ' + serialize(result)+ ';';
    },

    findLocales() {
      var locales = [];
      var config = this.project.config(this.app.env);
      var inputPath = config.intl.inputPath;
      var hasTranslationDir = fs.existsSync(path.join(this.app.project.root, inputPath));

      if (hasTranslationDir) {
        locales = locales.concat(walkSync(path.join(this.app.project.root, inputPath), ''));
        locales = locales.map(function(filename) {
          return path.basename(filename, path.extname(filename)).toLowerCase().replace(/_/g, '-');
        });
      }

      if (config.locales) {
        locales = locales.concat(config.locales);
      }

      locales = locales.concat(locales.filter(function(locale) {
        if (utils.isSupportedLocale(locale)) {
          return true;
        }

        console.log(`'${locale}' is not a valid locale name`);

        return false;
      }, this));

      return utils.unique(locales);
    },
};
