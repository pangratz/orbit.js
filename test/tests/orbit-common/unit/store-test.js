import Source from 'orbit/source';
import Schema from 'orbit-common/schema';
import Network from 'orbit-common/network';
import Store from 'orbit-common/store';
import qb from 'orbit-common/query/builder';
import CacheIntegrityProcessor from 'orbit-common/cache/operation-processors/cache-integrity-processor';
import SchemaConsistencyProcessor from 'orbit-common/cache/operation-processors/schema-consistency-processor';
import {
  addRecord
} from 'orbit-common/transform/operators';

const schemaDefinition = {
  models: {
    star: {
      attributes: {
        name: { type: 'string' }
      },
      relationships: {
        planets: { type: 'hasMany', model: 'planet', inverse: 'star' }
      }
    },
    planet: {
      attributes: {
        name: { type: 'string' },
        classification: { type: 'string' }
      },
      relationships: {
        moons: { type: 'hasMany', model: 'moon', inverse: 'planet' },
        star: { type: 'hasOne', model: 'star', inverse: 'planets' }
      }
    },
    moon: {
      attributes: {
        name: { type: 'string' }
      },
      relationships: {
        planet: { type: 'hasOne', model: 'planet', inverse: 'moons' }
      }
    }
  }
};

const schema = new Schema(schemaDefinition);
const network = new Network(schema);

module('OC - Store', function(hooks) {
  let store;

  hooks.beforeEach(function() {
    store = new Store({ network });
  });

  test('its prototype chain is correct', function(assert) {
    assert.ok(store instanceof Source, 'instanceof Source');
  });

  test('implements Queryable', function(assert) {
    assert.ok(store._queryable, 'implements Queryable');
    assert.ok(typeof store.query === 'function', 'has `query` method');
  });

  test('implements Updatable', function(assert) {
    assert.ok(store._updatable, 'implements Updatable');
    assert.ok(typeof store.update === 'function', 'has `update` method');
  });

  test('internal cache\'s options can be specified with `cacheOptions`', function() {
    var store = new Store({ network, cacheOptions: { processors: [CacheIntegrityProcessor, SchemaConsistencyProcessor] } });
    ok(store.cache, 'cache exists');
    equal(store.cache._processors.length, 2, 'cache has 2 processors');
  });

  test('#update - transforms the store\'s cache', function(assert) {
    assert.expect(3);

    const jupiter = {
      id: '1',
      type: 'planet',
      attributes: { name: 'Jupiter', classification: 'gas giant' }
    };

    assert.equal(store.cache.length('planet'), 0, 'cache should start empty');

    return store.update(addRecord(jupiter))
      .then(function() {
        assert.equal(store.cache.length('planet'), 1, 'cache should contain one planet');
        assert.deepEqual(store.cache.get('planet/1'), jupiter, 'planet should be jupiter');
      });
  });

  test('#query - queries the store\'s cache', function(assert) {
    assert.expect(2);

    let jupiter = {
      id: '1',
      type: 'planet',
      attributes: { name: 'Jupiter', classification: 'gas giant' }
    };

    store.cache.reset({
      planet: {
        '1': jupiter
      }
    });

    assert.equal(store.cache.length('planet'), 1, 'cache should contain one planet');

    return store.query(qb.record({ type: 'planet', id: '1' }))
      .then(function(foundPlanet) {
        assert.deepEqual(foundPlanet, jupiter, 'found planet matches original');
      });
  });

  QUnit.skip('#liveQuery', function(assert) {
    const done = assert.async();

    const jupiter = network.initializeRecord({ type: 'planet', id: 'jupiter', attributes: { name: 'Jupiter' } });
    const pluto = network.initializeRecord({ type: 'planet', id: 'pluto', attributes: { name: 'Pluto' } });

    const setupStore = store.update([
      addRecord(pluto),
      addRecord(jupiter)
    ]);

    setupStore.then(() => {
      const liveQuery = store.liveQuery(qb.records('planet'));
      liveQuery.subscribe(op => console.log(op));

      liveQuery.take(2).toArray().subscribe(operations => {
        assert.patternMatches(operations[0], { op: 'add', record: { id: 'pluto' } });
        assert.patternMatches(operations[0], { op: 'add', record: { id: 'jupiter' } });

        done();
      });
    });
  });
});
