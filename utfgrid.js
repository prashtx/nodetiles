
var path = require('path');
var Canvas = require('canvas');
var UTFGrid = require('./lib/utfgrid');

module.exports = {
  utfgrid: undefined
};

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
/******************* UTFGrid Functions ******************/

module.exports.utfgrid = function(req, res, layers) {
  var rasterSize = 64; // TODO: I think this should be 64 but I don't
                        // want to rewrite the transformations yet
  var d = new Date();
  
  // TODO: clean this up since it's halfway to Express.
  var coord = [req.params.zoom, req.params.col, path.basename(req.params.row, path.extname(req.params.row))];
  console.log(coord);
  if (!coord || coord.length != 3) {
      console.error(req.url, 'not a coord, match =', coord);
      res.writeHead(404);
      res.end();
      return;
  }
  
  coord = coord.map(Number);

  var canvas = new Canvas(rasterSize,rasterSize),
      ctx    = canvas.getContext('2d');
  
  // Don't want to blur colors together
  // this is a nice non-standard feature of node-canvas
  ctx.antialias = 'none';
  ctx.fillStyle = '#000000'; // Paint it black
  ctx.fillRect(0,0,64,64);

  // Render our Raster into ctx and return an color->feature index  
  var colorIndex = renderGrid(layers, ctx, coord[0], coord[1], coord[2]);

  console.log('Grid rendering done in', new Date() - d, 'ms');
  d = new Date();
  
  if (path.extname(req.params.row) == '.png') {    
    res.writeHead(200, {'Content-Type': 'image/png'});    
    var stream = canvas.createPNGStream(); // createSyncPNGStream(); 
    stream.on('data', function(chunk){
        res.write(chunk);
    });
    stream.on('end', function() {
        res.end();
    });
    console.log('done');
    return;
  }
  
  var pixels = ctx.getImageData(0, 0, 64, 64).data; // array of all pixels

  var utfgrid = (new UTFGrid(rasterSize, function (coord) {
    // Use our raster (ctx) and colorIndex to lookup the corresponding feature
    var x = coord.x,
        y = coord.y;

    //look up the the rgba values for the pixel at x,y
    // scan rows and columns; each pixel is 4 separate values (R,G,B,A) in the array
    var startPixel = (rasterSize * y + x) * 4;

    // convert those rgba elements to hex then an integer
    var intColor = h2d(d2h(pixels[startPixel], 2) + d2h(pixels[startPixel+1], 2) + d2h(pixels[startPixel+2], 2));

     return colorIndex[intColor]; // returns the feature that's referenced in colorIndex.
  })).encodeAsObject();
    
  for(var featureId in utfgrid.data) {
    // var newFeature = {};
    // Extend(true, newFeature, utfgrid.data[featureId]);
    // delete newFeature.geometry;
    utfgrid.data[featureId] = utfgrid.data[featureId].properties; 
  }
  
  // send it back to the browser as JSONP
  res.send('grid(' + JSON.stringify(utfgrid) + ')', { 'Content-Type': 'application/json' }, 200);
  console.log('Grid returned in ', new Date - d, 'ms');
}

// push Features onto the colorIndex array for later lookup
function renderGrid(layers, ctx, zoom, col, row) {
  var intColor = 1; // color zero is black/empty; so start with 1
  colorIndex = ['']; // make room for black/empty

  var sc = Math.pow(2, zoom - 2);
  ctx.scale(sc,sc);
  ctx.translate(-col*64/sc, -row*64/sc);
  layers.forEach(function(layer, layerIndex) {
    if (layerIndex != 0) { // TODO: make some way to configure which layers become UTFgrids
      layer.styles.forEach(function(style, styleIndex) {
        ctx.lineWidth = 'lineWidth' in style ? style.lineWidth / sc : 1.0 / sc;
        layer.features.forEach(function(feature, featureIndex) {
          ctx.fillStyle = style.fillStyle ? '#'+d2h(intColor,6) : ''; // only fill in if we have a style defined
          ctx.strokeStyle = style.strokeStyle ? '#'+d2h(intColor,6) : '';
        
          //console.log(ctx.fillStyle);
        
          ctx.beginPath();
          var coordinates = feature.geometry.coordinates;
          renderPath[feature.geometry.type].call(ctx, coordinates);
          if (ctx.fillStyle) {
            ctx.fill();
          }
          if (ctx.strokeStyle) {
            ctx.stroke();
          }
          ctx.closePath();
        
          colorIndex.push(feature); // this should like up with our colors.
          intColor++; // Go on to the next color;
        });
      });
   }
  });
  
  return colorIndex;
}

// hex helper functions
function d2h(d, digits) {
  d = d.toString(16); 
  while (d.length < digits) {
		d = '0' + d;
	}
	  
  return d;
}
function h2d(h) {
  return parseInt(h,16);
}

/******************* END UTFGrid Functions ******************/
