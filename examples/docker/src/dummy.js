(function(global){
    global.foo = 'bar';
    global.bar = function(){
        return 'foo';
    }
})(this)
