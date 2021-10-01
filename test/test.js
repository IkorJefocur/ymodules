require('chai').should();

var modules;

beforeEach(function() {
    modules = require('../modules').create();
});

describe('resolving', function() {
    it('should properly resolve dependencies by string', function(done) {
        modules.define('A', function(provide) {
            provide('A');
        });

        modules.require('A', function(d) {
            d.A.should.have.been.equal('A');
            done();
        });
    });

    it('should properly resolve dependencies (synchronously)', function(done) {
        modules.define('A', function(provide) {
            provide('A');
        });

        modules.define('B', ['A'], function(provide, d) {
            provide(d.A + 'B');
        });

        modules.define('C', ['A', 'B'], function(provide, d) {
            provide('C' + d.B + d.A);
        });

        modules.require(['C'], function(d) {
            d.C.should.have.been.equal('CABA');
            done();
        });
    });

    it('should properly resolve dependencies (asynchronously)', function(done) {
        modules.define('A', function(provide) {
            setTimeout(function() {
                provide('A');
            }, 10);
        });

        modules.define('B', ['A'], function(provide, d) {
            setTimeout(function() {
                provide(d.A + 'B');
            }, 10);
        });

        modules.define('C', ['A', 'B'], function(provide, d) {
            setTimeout(function() {
                provide('C' + d.B + d.A);
            }, 10);
        });

        modules.require(['C'], function(d) {
            d.C.should.have.been.equal('CABA');
            done();
        });
    });

    it('should properly resolve multiple declarations', function(done) {
        modules.define('A', function(provide) {
            provide('A1');
        });

        modules.define('A', function(provide, A) {
            provide(A + 'A2');
        });

        modules.define('A', function(provide, A) {
            provide(A + 'A3');
        });

        modules.require(['A'], function(d) {
            d.A.should.have.been.equal('A1A2A3');
            done();
        });
    });

    it('should properly set aliases to required modules', function(done) {
        modules.define('A', provide => provide('a'));
        modules.require([['A', 'B']], d => {
            d.B.should.have.been.equal('a');
            done();
        });
    });

    it('should properly clone existing modules and override their dependencies', function(done) {
        modules.define('A', provide => provide(['a']));
        modules.define('B', provide => provide(['b']));
        modules.define('C', ['A'], (provide, d) => provide(d.A.concat('c')));
        modules.define('D', [['C', {'A': 'B'}]], (provide, d) => provide(d.C));

        modules.require(['C', 'D'], d => {
            d.C.should.have.been.deep.equal(['a', 'c']);
            d.D.should.have.been.deep.equal(['b', 'c']);
            done();
        });
    });

    it('should propely resolve non-critical circular dependencies', function(done) {
        modules.define('A', ['B'], (provide, d) => provide({
            val: 'A',
            use: () => d.B.val
        }));
        modules.define('B', ['A'], (provide, d) => provide({
            val: 'B',
            use: () => d.A.val
        }));

        modules.require(['A'], function(d) {
            d.A.use().should.be.equal('B');
            done();
        });
    });
});

describe('errors', function() {
    it('should throw error on requiring undefined module', function(done) {
        modules.isDefined('A').should.have.been.equal(false);
        modules.require(['A'], function() {}, function(e) {
            e.message.should.have.been.equal('Required module "A" can\'t be resolved');
            done();
        });
    });

    it('should throw error on depending from undefined module', function(done) {
        modules.define('A', ['B'], function(provide) {
            provide('A');
        });

        modules.define('B', ['C'], function(provide) {
            provide('B');
        });

        modules.require(['A'], function() {}, function(e) {
            e.message.should.have.been.equal('Module "B": can\'t resolve dependence "C"');
            done();
        });
    });

    it('should throw error if declaration has already been provided', function(done) {
        modules.define('A', function(provide) {
            provide('A');
            provide('A');
        });

        modules.require(['A'], function() {}, function(e) {
            e.message.should.have.been.equal('Declaration of module "A" has already been provided');
            done();
        });
    });

    it('should throw error on circular dependence', function(done) {
        modules.define('A', ['C'], function(provide, d) {
            try { provide(d.C); }
            catch (e) { provide(null, e); }
        });

        modules.define('B', ['A'], function(provide, d) {
            try { provide(d.A); }
            catch (e) { provide(null, e); }
        });

        modules.define('C', ['B'], function(provide, d) {
            try { provide(d.B); }
            catch (e) { provide(null, e); }
        })

        modules.require(['A'], function() {}, function(e) {
            e.message.should.have.been.equal('Circular dependence has been detected: "A -> C -> B -> A"');
            done();
        });
    });

    it('should throw error on multiple declarations', function(done) {
        modules.setOptions({ allowMultipleDeclarations : false });

        modules.define('A', function(provide) {
            provide('A');
        });

        modules.define('A', function(provide) {
            provide('A');
        });

        modules.require(['A'], function() {}, function(e) {
            e.message.should.have.been.equal('Multiple declarations of module "A" have been detected');
            done();
        });
    });

    it('should allow to throw custom error', function(done) {
        var error = Error();

        modules.define('A', function(provide) {
            provide(null, error);
        });

        modules.require(['A'], function() {}, function(e) {
            e.should.have.been.equal(error);
            done();
        });
    });

    it('should properly restore state of modules after error of dependencies', function(done) {
        modules.define('A', ['B'], function(provide) {
            provide('A');
        });

        modules.define('B', ['C'], function(provide) {
            provide('B');
        });

        modules.require(['A'], function() {}, function() {
            modules.getState('B').should.be.equal('NOT_RESOLVED');
            modules.getState('A').should.be.equal('NOT_RESOLVED');
            done();
        });
    });

    it('should properly restore state of modules after custom error', function(done) {
        modules.define('A', ['B'], function(provide) {
            provide('A');
        });

        modules.define('B', ['C'], function(provide) {
            provide('B');
        });

        modules.define('C', function(provide) {
            provide(null, Error());
        });

        modules.require(['A'], function() {}, function() {
            modules.getState('C').should.be.equal('NOT_RESOLVED');
            modules.getState('B').should.be.equal('NOT_RESOLVED');
            modules.getState('A').should.be.equal('NOT_RESOLVED');
            modules.getState('X').should.be.equal('NOT_DEFINED');
            modules.getStat().should.to.deep.equal({
                NOT_RESOLVED: [ 'A', 'B', 'C' ]
            });
            done();
        });
    });

    it('should allow to rerequire module after error of dependencies', function(done) {
        modules.define('A', ['B'], function(provide) {
            provide('A');
        });

        modules.define('B', ['C'], function(provide) {
            provide('B');
        });

        modules.require(['A'], function() {}, function() {
            modules.define('C', function(provide) {
                provide('C');
            });
            modules.require(['A'], function() {
                done();
            });
        });
    });

    it('should allow to rerequire module after custom error', function(done) {
        modules.define('A', ['B'], function(provide, d) {
            provide('A' + d.B);
        });

        modules.define('B', ['C'], function(provide, d) {
            provide('B' + d.C);
        });

        var i = 0;
        modules.define('C', function(provide) {
            i++?
                provide('C') :
                provide(null, Error());
        });

        modules.require(['A'], function() {}, function() {
            modules.require(['A'], function(d) {
                d.A.should.be.equal('ABC');
                done();
            });
        });
    });

    it('should throw exception without error callback', function(done) {
        require('domain')
            .create()
            .on('error', function(e) {
                e.message.should.have.been.equal('Required module "A" can\'t be resolved');
                done();
            })
            .run(function() {
                modules.require(['A'], function() {});
            });
    });
});
