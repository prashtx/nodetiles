/*jshint node:true */
var Canvas = require('canvas');

// NB:- these functions are called using 'this' as our canvas context
// it's not clear to me whether this architecture is right but it's neat ATM.
var renderPath = {
    'MultiPolygon': function(mp) {
        mp.forEach(renderPath.Polygon, this);
    },
    'Polygon': function(p) {
        p.forEach(renderPath.LineString, this);
    },
    'MultiLineString': function(ml) {
        ml.forEach(renderPath.LineString, this);
    },
    'LineString': function(l) {
        this.moveTo(l[0][0], l[0][1]);
        l.slice(1).forEach(function(c){
            this.lineTo(c[0], c[1]);            
        }, this);
    },
    'MultiPoint': function(p) {
        console.warn('MultiPoint geometry not implemented in renderPath');
    },
    'Point': function(p) {
        console.warn('Point geometry not implemented in renderPath');
    }
};

var canvasBacklog = 0;
var bgColor = '#ddddff'; //'#ddddff';

function renderTile(layers, ctx, zoom, col, row) {
    var sc = Math.pow(2, zoom);
    ctx.scale(sc,sc);
    ctx.translate(-col*256/sc, -row*256/sc);
    layers.forEach(function(layer, i) {
        layer.styles.forEach(function(style) {
            ctx.fillStyle = style.fillStyle || '';
            ctx.strokeStyle = style.strokeStyle || '';
            ctx.lineWidth = 'lineWidth' in style ? style.lineWidth / sc : 1.0 / sc;
            layer.features.forEach(function(feature) {
                ctx.beginPath();
                var coordinates = feature.geometry.coordinates;
                renderPath[feature.geometry.type].call(ctx, coordinates);
                if (style.fillStyle) {
                    ctx.fill();
                }
                if (style.strokeStyle) {
                    ctx.stroke();
                }
                ctx.closePath();
            });
        });
    });
}

function streamTile(layers, coord, output) {

    var d = new Date();
    
    console.log('Requested tile: ' + coord.join('/'));
    var done = false;
    setTimeout(function () {
      if (!done) {
        console.log('!!! Tile ' + coord.join('/') + ' didn\'t finish in 10s!');
      }
    }, 1000 * 10);
    
    coord = coord.map(Number);
    //console.log('got coord', coord);

    var canvas = new Canvas(256,256),
        ctx = canvas.getContext('2d');
    canvasBacklog++;
    
    //ctx.antialias = 'none';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0,0,256,256);
    
    renderTile(layers, ctx, coord[0], coord[1], coord[2]);

    console.log('rendering done in', new Date() - d, 'ms');
    d = new Date();
    
    var stream = canvas.createPNGStream(); // createSyncPNGStream(); 
    stream.on('data', function(chunk){
        output.write(chunk);
    });
    stream.on('end', function() {
        console.log('Tile streaming done in', new Date() - d, 'ms');
        output.end();
        console.log('Returned tile: ' + coord.join('/') + '['+ --canvasBacklog +' more in backlog]');
        done = true;
    });
    stream.on('close', function() {
        console.log("STREAM CLOSED");
    });
}

module.exports = {
  streamTile: streamTile
};

