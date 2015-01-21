/**
 * @description Google Chart Api Directive Module for AngularJS
 * @version 0.0.11
 * @author Nicolas Bouillon <nicolas@bouil.org>
 * @author GitHub contributors
 * @license MIT
 * @year 2013
 */
(function (document, window, angular) {
    'use strict';

    angular.module('googlechart', [])

        .value('googleChartApiConfig', {
            version: '1',
            optionalSettings: {
                packages: ['corechart']
            }
        })

        .provider('googleJsapiUrl', function () {
            var protocol = 'https:';
            var url = '//www.google.com/jsapi';

            this.setProtocol = function(newProtocol) {
                protocol = newProtocol;
            };

            this.setUrl = function(newUrl) {
                url = newUrl;
            };

            this.$get = function() {
                return (protocol ? protocol : '') + url;
            };
        })
        .factory('googleChartApiPromise', ['$rootScope', '$q', 'googleChartApiConfig', 'googleJsapiUrl', function ($rootScope, $q, apiConfig, googleJsapiUrl) {
            var apiReady = $q.defer();
            var onLoad = function () {
                // override callback function
                var settings = {
                    callback: function () {
                        var oldCb = apiConfig.optionalSettings.callback;
                        $rootScope.$apply(function () {
                            apiReady.resolve();
                        });

                        if (angular.isFunction(oldCb)) {
                            oldCb.call(this);
                        }
                    }
                };

                settings = angular.extend({}, apiConfig.optionalSettings, settings);

                window.google.load('visualization', apiConfig.version, settings);
            };
            var head = document.getElementsByTagName('head')[0];
            var script = document.createElement('script');

            script.setAttribute('type', 'text/javascript');
            script.src = googleJsapiUrl;

            if (script.addEventListener) { // Standard browsers (including IE9+)
                script.addEventListener('load', onLoad, false);
            } else { // IE8 and below
                script.onreadystatechange = function () {
                    if (script.readyState === 'loaded' || script.readyState === 'complete') {
                        script.onreadystatechange = null;
                        onLoad();
                    }
                };
            }

            head.appendChild(script);

            return apiReady.promise;
        }])
        .directive('googleChart', ['$timeout', '$window', '$rootScope', 'googleChartApiPromise', function ($timeout, $window, $rootScope, googleChartApiPromise) {
            return {
                restrict: 'A',
                scope: {
                    beforeDraw: '&',
                    chart: '=chart',
                    chartRef: '@',
                    onReady: '&',
                    onSelect: '&',
                    select: '&'
                },
                link: function ($scope, $elm, $attrs) {

                    if ($scope.chartRef) {
                        $scope.$parent.$watch($scope.chartRef, function (obj) {
                            if (obj) {
                                drawAsync(obj);
                            }
                        }, true); // true is for deep object equality checking
                    }
                    /* Watches, to refresh the chart when its data, formatters, options, view,
                        or type change. All other values intentionally disregarded to avoid double
                        calls to the draw function. Please avoid making changes to these objects
                        directly from this directive.*/
                    $scope.$watch(function () {
                        if ($scope.chart) {
                            return {
                                customFormatters: $scope.chart.customFormatters,
                                data: $scope.chart.data,
                                formatters: $scope.chart.formatters,
                                options: $scope.chart.options,
                                type: $scope.chart.type,
                                view: $scope.chart.view
                            };
                        }
                        return $scope.chart;
                    }, function () {
                        drawAsync($scope.chart);
                    }, true); // true is for deep object equality checking

                    // Redraw the chart if the window is resized
                    var resizeHandler = $rootScope.$on('resizeMsg', function () {
                        $timeout(function () {
                            // Not always defined yet in IE so check
                            if($scope.chartWrapper) {
                                drawAsync($scope.chart);
                            }
                        });
                    });

                    //Cleanup resize handler.
                    $scope.$on('$destroy', function () {
                        resizeHandler();
                    });

                    // Keeps old formatter configuration to compare against
                    $scope.oldChartFormatters = {};

                    function applyFormat(aChart, formatType, FormatClass, dataTable) {
                        var i;
                        if (typeof(aChart.formatters[formatType]) !== 'undefined') {
                            if (!angular.equals(aChart.formatters[formatType], $scope.oldChartFormatters[formatType])) {
                                $scope.oldChartFormatters[formatType] = aChart.formatters[formatType];
                                $scope.formatters[formatType] = [];

                                if (formatType === 'color') {
                                    for (var cIdx = 0; cIdx < aChart.formatters[formatType].length; cIdx++) {
                                        var colorFormat = new FormatClass();

                                        for (i = 0; i < aChart.formatters[formatType][cIdx].formats.length; i++) {
                                            var data = aChart.formatters[formatType][cIdx].formats[i];

                                            if (typeof(data.fromBgColor) !== 'undefined' && typeof(data.toBgColor) !== 'undefined') {
                                                colorFormat.addGradientRange(data.from, data.to, data.color, data.fromBgColor, data.toBgColor);
                                            }
                                            else {
                                                colorFormat.addRange(data.from, data.to, data.color, data.bgcolor);
                                            }
                                        }

                                        $scope.formatters[formatType].push(colorFormat);
                                    }
                                } else {

                                    for (i = 0; i < aChart.formatters[formatType].length; i++) {
                                        $scope.formatters[formatType].push(new FormatClass(
                                            aChart.formatters[formatType][i])
                                        );
                                    }
                                }
                            }


                            //apply formats to dataTable
                            for (var j = 0; j < $scope.formatters[formatType].length; j++) {
                                if (aChart.formatters[formatType][j].columnNum < dataTable.getNumberOfColumns()) {
                                    $scope.formatters[formatType][j].format(dataTable, aChart.formatters[formatType][j].columnNum);
                                }
                            }


                            //Many formatters require HTML tags to display special formatting
                            if (formatType === 'arrow' || formatType === 'bar' || formatType === 'color') {
                                aChart.options.allowHtml = true;
                            }
                        }
                    }

                    function draw(aChart) {
                        if (!draw.triggered && (aChart !== undefined)) {
                            draw.triggered = true;
                            $timeout(function () {

                                if (typeof ($scope.chartWrapper) === 'undefined') {
                                    var chartWrapperArgs = {
                                        chartType: aChart.type,
                                        dataTable: aChart.data,
                                        view: aChart.view,
                                        options: aChart.options,
                                        containerId: $elm[0]
                                    };

                                    $scope.chartWrapper = new google.visualization.ChartWrapper(chartWrapperArgs);
                                    google.visualization.events.addListener($scope.chartWrapper, 'ready', function () {
                                        aChart.displayed = true;
                                        $scope.$apply(function (scope) {
                                            scope.onReady({ chartWrapper: scope.chartWrapper });
                                        });
                                    });
                                    google.visualization.events.addListener($scope.chartWrapper, 'error', function (err) {
                                        console.log('Chart not displayed due to error: ' + err.message + '. Full error object follows.');
                                        console.log(err);
                                    });
                                    google.visualization.events.addListener($scope.chartWrapper, 'select', function () {
                                        var selectEventRetParams = { selectedItems: $scope.chartWrapper.getChart().getSelection() };
                                        // This is for backwards compatibility for people using 'selectedItem' that only wanted the first selection.
                                        selectEventRetParams.selectedItem = selectEventRetParams.selectedItems[0];
                                        $scope.$apply(function () {
                                            if ($attrs.select) {
                                                console.log('Angular-Google-Chart: The \'select\' attribute is deprecated and will be removed in a future release.  Please use \'onSelect\'.');
                                                $scope.select(selectEventRetParams);
                                            }
                                            else {
                                                $scope.onSelect(selectEventRetParams);
                                            }
                                        });
                                    });
                                }
                                else {
                                    $scope.chartWrapper.setChartType(aChart.type);
                                    $scope.chartWrapper.setDataTable(aChart.data);
                                    $scope.chartWrapper.setView(aChart.view);
                                    $scope.chartWrapper.setOptions(aChart.options);
                                }

                                if (typeof($scope.formatters) === 'undefined') {
                                    $scope.formatters = {};
                                }

                                if (typeof(aChart.formatters) !== 'undefined') {
                                    applyFormat(aChart, 'number', google.visualization.NumberFormat, $scope.chartWrapper.getDataTable());
                                    applyFormat(aChart, 'arrow', google.visualization.ArrowFormat, $scope.chartWrapper.getDataTable());
                                    applyFormat(aChart, 'date', google.visualization.DateFormat, $scope.chartWrapper.getDataTable());
                                    applyFormat(aChart, 'bar', google.visualization.BarFormat, $scope.chartWrapper.getDataTable());
                                    applyFormat(aChart, 'color', google.visualization.ColorFormat, $scope.chartWrapper.getDataTable());
                                }

                                var customFormatters = aChart.customFormatters;
                                if (typeof(customFormatters) !== 'undefined') {
                                    for (var name in customFormatters) {
                                        applyFormat(name, customFormatters[name], $scope.chartWrapper.getDataTable());
                                    }
                                }

                                $timeout(function () {
                                    $scope.beforeDraw({ chartWrapper: $scope.chartWrapper });
                                    $scope.chartWrapper.draw();
                                    draw.triggered = false;
                                });
                            }, 0, true);
                        } else if (aChart !== undefined) {
                            $timeout.cancel(draw.recallTimeout);
                            draw.recallTimeout = $timeout(draw, 10);
                        }
                    }

                    function drawAsync(aChart) {
                        googleChartApiPromise.then(function () {
                            draw(aChart);
                        });
                    }
                }
            };
        }])

        .run(['$rootScope', '$window', function ($rootScope, $window) {
            angular.element($window).bind('resize', function () {
                $rootScope.$emit('resizeMsg');
            });
        }]);

})(document, window, window.angular);
