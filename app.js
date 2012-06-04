// node.js geo polygon map tile rendering!
// requires https://github.com/learnboost/node-canvas and GeoJSON data files
// e.g. 
// data from naturalearthdata.com converted to GeoJSON with GDAL's ogr2ogr
// or from datasf.org, reprojected too:
// ogr2ogr -f GeoJSON sfbay.js sfbay.shp -t_srs EPSG:4326

var Canvas = require('canvas'),
    Connect = require('connect'),
    Express = require('express'),
    path = require('path'),
    http = require('http'),
    fs = require('fs');
    
var utfgrid = require('./utfgrid');
var renderEngine = require('./renderEngine');

var port = process.env.PORT || 3000;
    
var project = {
    'FeatureCollection': function(fc) { fc.features.forEach(project.Feature); },
    'Feature': function(f) { project[f.geometry.type](f.geometry.coordinates); },
    'MultiPolygon': function(mp) { mp.forEach(project.Polygon); },    
    'Polygon': function(p) { p.forEach(project.LineString); },
    'MultiLineString': function(ml) { ml.forEach(project.LineString); },
    'LineString': function(l) { l.forEach(project.Point); },
    'MultiPoint': function(mp) { mp.forEach(project.Point); },    
    'Point': function(c) {
        c[0] = 256.0 * (c[0] + 180) / 360.0;
        c[1] = 256.0 - 256.0 * (Math.PI + Math.log(Math.tan(Math.PI/4+c[1]*(Math.PI/180)/2))) / (2*Math.PI);
    }
}

function Layer(filename, styles) {
    var data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    data.styles = styles;
    return data;
}

console.log('loading layers...');
var layers = [ 
    //Layer('./geodata/10m_land.json', [ { fillStyle: '#ffffee', strokeStyle: '#888', lineWidth: 1.0 } ]),
    //Layer('./geodata/baltimore-boundaries.json', [ { fillStyle: 'rgba(0,0,0,.5)', strokeStyle: 'rgba(255,255,255,.8)', lineWidth: 1.0 } ]),
    //Layer('./geodata/sf_parcels.json', [ { fillStyle: 'rgba(0,0,0,.5)', strokeStyle: 'rgba(255,255,255,.8)', lineWidth: 1.0 } ]),
    //Layer('./geodata/10m_land.json', [ { fillStyle: '#ffffee', strokeStyle: '#888', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_shore.json', [ { fillStyle: '#ffffee', strokeStyle: '#888', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_parks.json', [ { fillStyle: 'rgba(0,255,0,.5)', strokeStyle: 'rgba(255,255,255, .5)', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_streets.json', [ { strokeStyle: 'rgba(0,0,0,.8)', lineWidth: 1.0 } ]),
    //Layer('./geodata/sf_elect_precincts.json', [ { strokeStyle: 'rgba(255,0,200,.8)', lineWidth: 1.0 } ]),
    
    //Layer('./datasf/sflnds_parks.js', [ { fillStyle: '#ddffdd' } ]),
    //Layer('./datasf/phys_waterbodies.js', [ { fillStyle: '#ddddff' } ]),
    //Layer('./datasf/StClines.js', [ { strokeStyle: '#aaa', lineWidth: 1.0 } ])
];
/*var layers = [
    Layer('./naturalearthdata/10m_land.js', [ { fillStyle: '#ffffee' } ]),
    Layer('./naturalearthdata/10m_glaciated_areas.js', [ { fillStyle: '#ffffff' } ]),
    Layer('./naturalearthdata/10m_rivers_lake_centerlines.js', [ { strokeStyle: '#ddddff' } ]),
    Layer('./naturalearthdata/10m_lakes.js', [ { fillStyle: '#ddddff' } ]),
    Layer('./naturalearthdata/10m_us_parks_area.js', [ { fillStyle: '#ddffdd' } ]),
    Layer('./naturalearthdata/10m-urban-area.js', [ { fillStyle: '#eeeedd' } ]),
    Layer('./naturalearthdata/10m_railroads.js', [ { strokeStyle: '#777777' } ]),
    Layer('./naturalearthdata/10m_roads.js', [ { strokeStyle: '#aa8888' } ])
// TODO more boundaries from http://www.naturalearthdata.com/downloads/10m-cultural-vectors/
//    Layer('./naturalearthdata/10m_geography_regions_polys.js', [ { strokeStyle: 'rgba(0,0,0,0.2)' } ]),    
//    Layer('./naturalearthdata/10m_populated_places_simple.js', [ { fillStyle: '#ffffee' } ]),
//    Layer('./naturalearthdata/10m_roads_north_america.js', [ { strokeStyle: '#888888' } ])
];*/
console.log('done loading');

console.log('projecting features...');
var t = +new Date();
layers.forEach(project.FeatureCollection);
console.log('done projecting in', new Date() - t, 'ms'); 

var canvasBacklog = 0;

function tile(req, res) {
  // TODO: clean this up since it's halfway to Express
  var coord = [req.params.zoom, req.params.col, path.basename(req.params.row, '.png')];
  if (!coord || coord.length != 3) {
      console.error(req.url, 'not a coord, match =', coord);
      res.writeHead(404);
      res.end();
      return;
  }

  res.writeHead(200, {'Content-Type': 'image/png'});    
  renderEngine.streamTile(layers, coord, res);
}



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





var app = Express.createServer();

app.use(Connect.compress()); // compression

app.get('/', function(req, res){
  res.send(fs.readFileSync('./views/leaflet.html', 'utf8'));
});
app.get('/sf_tile.jsonp', function(req, res){
  res.send(fs.readFileSync('./views/sf_tile.jsonp', 'utf8'));
});
app.get('/tiles/:zoom/:col/:row', tile);

app.get('/utfgrids/:zoom/:col/:row', function(req, res) {return utfgrid.utfgrid(req, res, layers);});

app.listen(port);
