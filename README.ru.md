Модульная система YModules
=================

[Что это? Зачем и для кого? Как пользоваться?](https://github.com/IkorJefocur/ymodules/blob/master/what-is-this.md)

#### Требования
  1. Асинхронный require модулей
  2. Асинхронный provide модулей
  3. Возможность передекларации/додекларации модуля
  4. Возможность перезаписи зависимостей существующего модуля с его повторным подключением

#### Почему не CommonJS?
Смотри пункты 1, 2, 3 и 4 требований

#### Почему не AMD?
Смотри пункты 2, 3 и 4 требований

Спецификация API
----------------

#### Синтаксис описания зависимости
````javascript
Array Dependency(
    String name,
    [String alias] = name
    [Object overrides]
)
````

#### Объявление модуля
````javascript
void modules.define(
    String moduleName,
    [Dependency[] dependencies],
    Function(
        Function([Object objectToProvide], [Error error]) provide,
        [Object resolvedDependencies],
        [Object previousDeclaration]
    ) declarationFunction
)
````
#### Подключение модуля
````javascript
void modules.require(
    Dependency[] dependencies,
    Function(Object resolvedDependencies) successCallbackFunction,
    [Function(Error error) errorCallbackFunction]
)
````

#### Создание нового хранилища модулей
````javascript
Modules modules.create()
````

#### Настройка хранилища модулей
````javascript
void setOptions(Object options)
````

##### Доступные опции
  - `trackCircularDependencies` - при `false` не проверяет зацикленные зависимости. По умолчанию `true`
  - `allowMultipleDeclarations` - при `false` запрещает расширение (переопределение) модулей и генерирует ошибку. По умолчанию `true`
  - `allowDependenciesOverride` - при `false` запрещает перезапись зависимостей и клонирование модулей. По умолчанию `true`

#### Получение текущего состояния модуля в хранилище
````javascript
String getState(String name)
````

##### Возможные состояния
  - `NOT_DEFINED` - не было объявления модуля
  - `NOT_RESOLVED` - модуль был объявлен, но разрешение зависимостей еще не начато
  - `IN_RESOLVING` - в процессе разрешения зависимостей модуля
  - `RESOLVED` - зависимости разрешены

#### Проверка наличия объявления модуля в хранилище
````javascript
Boolean isDefined(String moduleName)
````

#### Пример

````javascript
modules.define(
    'A',
    ['B', 'C'],
    function(provide, {B, C}) {
        var a = {};
        provide(a);
    });

modules.define(
    'B',
    function(provide) {
        var b = {};
        provide(b);
    });

modules.define(
    'C',
    ['B'],
    function(provide, {B}) {
        var c = {};
        provide(c);
    });

modules.define(
    'C',
    function(provide, prevC) {
        var nextC = {};
        provide(nextC);
    });

modules.define(
    'D',
    [['A', 'main']],
    function(provide, {main}) {
        provide('d');
    });

modules.require(
  ['A'],
  function(d) {
    // module 'A' now resolved to a
  });
````
