var global = this;

describe("A suite is just a function", function() {

    it("and so is a spec", function() {
        expect(global.foo).toBe('bar');
        expect(global.bar()).toBe('foo');
    });
});
